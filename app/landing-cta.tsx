"use client";

// CB-1.6 — Landing-page CTA with auto-focus on mount.
//
// The landing Server Component is otherwise static, but design.md
// § Accessibility checklist requires focus moves to the primary CTA on
// mount. Server Components can't run useEffect; this thin client wrapper
// is the minimal-surface fix. The href + label are passed in from the
// Server Component so the copy strings remain controlled there.

import type { JSX } from "react";
import { useEffect, useRef } from "react";

export function LandingCTA({
  href,
  label,
  style,
}: {
  href: string;
  label: string;
  style?: React.CSSProperties;
}): JSX.Element {
  const ref = useRef<HTMLAnchorElement>(null);

  useEffect(() => {
    ref.current?.focus();
  }, []);

  return (
    <a ref={ref} href={href} style={style}>
      {label}
    </a>
  );
}
