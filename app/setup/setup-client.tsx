"use client";

import type { JSX } from "react";

// CB-1.6 — /setup client component. Fires WebAuthn registration ceremony via
// @simplewebauthn/browser. Auto-derives device label from navigator.userAgent
// per PM DRI Decision #2 (story.md). On success → router.push('/dashboard').
//
// Copy verbatim from docs/bets/CB-1/stories/CB-1.6/copy.md § /setup. Do not
// paraphrase. AGENTS.md principle #10.

import { startRegistration } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { deriveDeviceLabel } from "@/app/setup/lib/device-label";

type Phase = "idle" | "in-flight" | "success" | "error";

export type ErrorKey =
  | "browser-unsupported"
  | "user-cancelled"
  | "verification-failed"
  | "registration-disabled"
  | "rate-limited"
  | "origin-mismatch"
  | "network";

// Copy strings — verbatim per copy.md § /setup error messages.
// `registration-disabled` is split into a prefix + a CTA-link suffix so the
// "Go to sign in." trailing copy renders as a real link rather than as
// duplicated plain text (per copy.md § error table CTA annotation).
const ERROR_COPY: Record<Exclude<ErrorKey, "registration-disabled">, string> = {
  "browser-unsupported": "This browser doesn't support passkeys. Try Safari (macOS / iOS) or Chrome (any platform).",
  "user-cancelled": "Passkey registration cancelled.",
  "verification-failed": "Passkey registration failed. Try again, or pick a different device.",
  "rate-limited": "Too many setup attempts. Wait a minute and try again.",
  "origin-mismatch": "Setup blocked: this page must run on the deployed instance, not a local copy.",
  network: "Setup failed. Check your connection and try again.",
};
const REGISTRATION_DISABLED_PREFIX = "This instance already has a passkey registered. ";
const REGISTRATION_DISABLED_LINK_TEXT = "Go to sign in.";

export function SetupClient(): JSX.Element {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Per design.md Accessibility checklist: focus primary CTA on mount.
    buttonRef.current?.focus();
  }, []);

  async function handleRegister(): Promise<void> {
    setPhase("in-flight");
    setErrorKey(null);

    // Browser-support guard up-front so the error is typed, not a generic crash.
    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      setErrorKey("browser-unsupported");
      setPhase("error");
      return;
    }

    try {
      const deviceLabel = deriveDeviceLabel(navigator.userAgent);

      // 1. Fetch registration options from begin endpoint
      const beginRes = await fetch("/api/auth/register/begin", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceLabel }),
      });

      if (!beginRes.ok) {
        setErrorKey(await classifyErrorResponse(beginRes));
        setPhase("error");
        return;
      }
      const beginBody = (await beginRes.json()) as {
        options?: Parameters<typeof startRegistration>[0]["optionsJSON"];
      };
      const options = beginBody.options;
      if (!options) {
        setErrorKey("network");
        setPhase("error");
        return;
      }

      // 2. Browser WebAuthn ceremony
      let attestation;
      try {
        attestation = await startRegistration({ optionsJSON: options });
      } catch (err) {
        setErrorKey(classifyWebAuthnError(err));
        setPhase("error");
        return;
      }

      // 3. POST attestation to finish endpoint
      const finishRes = await fetch("/api/auth/register/finish", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: attestation }),
      });

      if (!finishRes.ok) {
        setErrorKey(await classifyErrorResponse(finishRes));
        setPhase("error");
        return;
      }

      setPhase("success");
      // Brief success transient (~400ms) before navigation per design.md.
      setTimeout(() => router.push("/dashboard"), 400);
    } catch {
      setErrorKey("network");
      setPhase("error");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
    // Per design.md Accessibility: Esc dismisses error region.
    if (e.key === "Escape" && phase === "error") {
      setErrorKey(null);
      setPhase("idle");
      buttonRef.current?.focus();
    }
  }

  const isBusy = phase === "in-flight" || phase === "success";
  const buttonLabel = phase === "in-flight"
    ? "Waiting for passkey…"
    : phase === "success"
      ? "Passkey registered"
      : "Register passkey";

  return (
    <div onKeyDown={handleKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleRegister}
        disabled={isBusy}
        aria-busy={isBusy}
        style={{
          padding: "0.75rem 1.5rem",
          fontSize: "1rem",
          cursor: isBusy ? "default" : "pointer",
          minWidth: "12rem",
        }}
      >
        {buttonLabel}
      </button>

      {phase === "error" && errorKey && (
        <div
          role="alert"
          style={{ marginTop: "1.5rem", color: "#b00020", fontSize: "0.9375rem" }}
        >
          {errorKey === "registration-disabled" ? (
            <>
              {REGISTRATION_DISABLED_PREFIX}
              <a href="/sign-in" style={{ color: "#b00020", textDecoration: "underline" }}>
                {REGISTRATION_DISABLED_LINK_TEXT}
              </a>
            </>
          ) : (
            ERROR_COPY[errorKey]
          )}
        </div>
      )}
    </div>
  );
}

// Exported for direct unit-test coverage in
// tests/app/setup-client-error-mapping.test.ts. The classify chain
// (fetch Response → body parse → typed-error extraction → status+typed
// disambiguation → ErrorKey) is load-bearing per the 2026-06-05 canary
// verification retro — regression in ANY link re-introduces the 403/origin-
// mismatch masquerade that burned ~4 hours of debug. Tests exercise:
//   * classifyErrorResponse with a real Response object (body parse + typed
//     extraction + dispatch into errorKeyForResponse)
//   * errorKeyForResponse with the (status, typedError) matrix directly
// Per "use client" Next.js semantics, exporting pure helpers from a client
// component file is fine — they stay bundled as JS and do not become
// Server Actions.
export async function classifyErrorResponse(res: Response): Promise<ErrorKey> {
  // Read typed error from response body to disambiguate 4xx paths that
  // share a status code. The .clone() guards against the caller having
  // already consumed the body upstream (rare in practice, but cheap to
  // guarantee). try/catch handles non-JSON bodies — Vercel platform
  // 403/502 pages, network failures mid-stream, etc.
  let typedError: string | null = null;
  try {
    const body = (await res.clone().json()) as { error?: unknown };
    if (typeof body.error === "string") typedError = body.error;
  } catch {
    // body not JSON; fall through to status-only classification
  }
  return errorKeyForResponse(res.status, typedError);
}

export function errorKeyForResponse(status: number, typedError: string | null = null): ErrorKey {
  // Body-typed error takes precedence over status — disambiguates multiple
  // 4xx paths that may share a status code. See the 2026-06-05 canary
  // verification retro (docs/retros/) for the live failure mode that
  // motivated this: /register/begin USED to return 403 with body
  // { error: "registration-disabled" }, which the status-only mapping
  // mis-classified as "origin-mismatch" and rendered the wrong copy.
  if (typedError === "registration-disabled") return "registration-disabled";
  if (status === 409) return "registration-disabled";
  if (status === 429) return "rate-limited";
  if (status === 403) return "origin-mismatch";
  if (status === 400) return "verification-failed";
  return "network";
}

function classifyWebAuthnError(err: unknown): ErrorKey {
  if (err instanceof Error) {
    // User-cancellation surfaces as NotAllowedError or AbortError per WebAuthn spec.
    if (err.name === "NotAllowedError" || err.name === "AbortError") {
      return "user-cancelled";
    }
    // NotSupportedError indicates browser/authenticator capability mismatch.
    if (err.name === "NotSupportedError") {
      return "browser-unsupported";
    }
  }
  return "verification-failed";
}
