"use client";

import type { JSX } from "react";

// CB-1.6 — /sign-in client component. Fires WebAuthn authentication ceremony
// via @simplewebauthn/browser. Receives a pre-validated `safeNext` prop from
// the Server Component gate (validation happens server-side via
// @/lib/auth/safe-next so the client never has to revalidate). On success →
// router.push(safeNext ?? '/dashboard').
//
// Copy verbatim from docs/bets/CB-1/stories/CB-1.6/copy.md § /sign-in.

import { startAuthentication } from "@simplewebauthn/browser";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "in-flight" | "success" | "error";

type ErrorKey =
  | "browser-unsupported"
  | "user-cancelled"
  | "verification-failed"
  | "counter-replay"
  | "rate-limited"
  | "origin-mismatch"
  | "network";

// Copy strings — verbatim per copy.md § /sign-in error messages.
const ERROR_COPY: Record<ErrorKey, string> = {
  "browser-unsupported": "This browser doesn't support passkeys. Try Safari (macOS / iOS) or Chrome (any platform).",
  "user-cancelled": "Sign-in cancelled.",
  "verification-failed": "Sign-in failed. Try again, or check that the passkey is on this device.",
  "counter-replay": "Sign-in blocked: this passkey appears to have been replayed. Check the runbook.",
  "rate-limited": "Too many sign-in attempts. Wait a minute and try again.",
  "origin-mismatch": "Sign-in blocked: this page must run on the deployed instance, not a local copy.",
  network: "Sign-in failed. Check your connection and try again.",
};

export function SignInClient({ safeNext }: { safeNext: string | null }): JSX.Element {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    buttonRef.current?.focus();
  }, []);

  async function handleSignIn(): Promise<void> {
    setPhase("in-flight");
    setErrorKey(null);

    if (typeof window === "undefined" || !window.PublicKeyCredential) {
      setErrorKey("browser-unsupported");
      setPhase("error");
      return;
    }

    try {
      const beginRes = await fetch("/api/auth/authenticate/begin", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      if (!beginRes.ok) {
        setErrorKey(errorKeyForResponse(beginRes.status));
        setPhase("error");
        return;
      }
      const beginBody = (await beginRes.json()) as {
        options?: Parameters<typeof startAuthentication>[0]["optionsJSON"];
      };
      const options = beginBody.options;
      if (!options) {
        setErrorKey("network");
        setPhase("error");
        return;
      }

      let assertion;
      try {
        assertion = await startAuthentication({ optionsJSON: options });
      } catch (err) {
        setErrorKey(classifyWebAuthnError(err));
        setPhase("error");
        return;
      }

      const finishRes = await fetch("/api/auth/authenticate/finish", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: assertion }),
      });

      if (!finishRes.ok) {
        // The /authenticate/finish endpoint returns typed JSON error codes:
        // "counter-replay-detected" is distinct from "verification-failed";
        // copy.md requires the distinct message for the replay case.
        let typedError: string | null = null;
        try {
          const body = (await finishRes.json()) as { error?: unknown };
          if (typeof body.error === "string") typedError = body.error;
        } catch {
          // body not JSON; fall through to status-only classification
        }
        setErrorKey(errorKeyForResponse(finishRes.status, typedError));
        setPhase("error");
        return;
      }

      setPhase("success");
      setTimeout(() => router.push(safeNext ?? "/dashboard"), 400);
    } catch {
      setErrorKey("network");
      setPhase("error");
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLDivElement>): void {
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
      ? "Signed in"
      : "Sign in with passkey";

  return (
    <div onKeyDown={handleKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleSignIn}
        disabled={isBusy}
        aria-busy={isBusy}
        style={{
          padding: "0.75rem 1.5rem",
          fontSize: "1rem",
          cursor: isBusy ? "default" : "pointer",
          minWidth: "14rem",
        }}
      >
        {buttonLabel}
      </button>

      {phase === "error" && errorKey && (
        <div
          role="alert"
          style={{ marginTop: "1.5rem", color: "#b00020", fontSize: "0.9375rem" }}
        >
          {ERROR_COPY[errorKey]}
        </div>
      )}
    </div>
  );
}

function errorKeyForResponse(status: number, typedError: string | null = null): ErrorKey {
  if (status === 429) return "rate-limited";
  if (status === 403) return "origin-mismatch";
  if (status === 400) {
    if (typedError === "counter-replay-detected") return "counter-replay";
    return "verification-failed";
  }
  return "network";
}

function classifyWebAuthnError(err: unknown): ErrorKey {
  if (err instanceof Error) {
    if (err.name === "NotAllowedError" || err.name === "AbortError") {
      return "user-cancelled";
    }
    if (err.name === "NotSupportedError") {
      return "browser-unsupported";
    }
  }
  return "verification-failed";
}
