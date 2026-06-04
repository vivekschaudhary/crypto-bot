"use client";

import type { JSX } from "react";

// CB-1.6 — /dashboard sign-out button client component. POSTs to
// /api/auth/sign-out (CB-1.5 endpoint). On 200 OR 401 → router.push('/')
// (401 is treated as success-equivalent per CB-1.6 copy.md § Sign-out
// error — the session is already gone server-side; the UX outcome
// matches success). 403 → render the origin-mismatch error.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

type Phase = "idle" | "in-flight" | "error";
type ErrorKey = "origin-mismatch" | "network";

// Copy verbatim per copy.md § /dashboard sign-out errors.
const ERROR_COPY: Record<ErrorKey, string> = {
  "origin-mismatch": "Sign-out blocked. Try again from the deployed instance.",
  network: "Sign-out failed. Try again.",
};

export function SignOutClient(): JSX.Element {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("idle");
  const [errorKey, setErrorKey] = useState<ErrorKey | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // Per design.md Accessibility checklist: focus moves to the sign-out
    // button on dashboard mount (it's the primary action of this story's
    // dashboard view).
    buttonRef.current?.focus();
  }, []);

  async function handleSignOut(): Promise<void> {
    setPhase("in-flight");
    setErrorKey(null);

    try {
      const res = await fetch("/api/auth/sign-out", {
        method: "POST",
        credentials: "include",
        headers: { "content-type": "application/json" },
      });

      // 200 OR 401 → success-equivalent: navigate to /. Per copy.md, 401
      // means the session is already invalidated server-side mid-flight;
      // the UX outcome matches success and we should NOT show an error.
      if (res.status === 200 || res.status === 401) {
        router.push("/");
        return;
      }

      if (res.status === 403) {
        setErrorKey("origin-mismatch");
        setPhase("error");
        return;
      }

      setErrorKey("network");
      setPhase("error");
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

  const isBusy = phase === "in-flight";
  const buttonLabel = isBusy ? "Signing out…" : "Sign out";

  return (
    <div onKeyDown={handleKeyDown}>
      <button
        ref={buttonRef}
        type="button"
        onClick={handleSignOut}
        disabled={isBusy}
        aria-busy={isBusy}
        style={{
          padding: "0.5rem 1rem",
          fontSize: "0.9375rem",
          cursor: isBusy ? "default" : "pointer",
        }}
      >
        {buttonLabel}
      </button>

      {phase === "error" && errorKey && (
        <div
          role="alert"
          style={{ marginTop: "0.75rem", color: "#b00020", fontSize: "0.875rem" }}
        >
          {ERROR_COPY[errorKey]}
        </div>
      )}
    </div>
  );
}
