// Device-label derivation from `navigator.userAgent`.
//
// Per CB-1.6 PM DRI Decision #2 (story.md): operator does NOT enter a label
// manually at /setup — the registration ceremony auto-derives a short, human-
// readable label from the User-Agent string. n=1 single-operator product
// means a form field would add friction to the < 5-min guardrail without
// providing real value at MVP.
//
// Output shape: a short string like "Safari on macOS", "Chrome on Linux",
// or "Firefox on Windows". When the UA doesn't match a known browser/OS
// combination, returns "this device" — same fallback string used at render
// time per copy.md § Connected device line.
//
// This file is intentionally pure (no DOM access) so it's unit-testable:
// the caller passes `navigator.userAgent` in; the function returns the
// label. Browsers freeze User-Agent strings differently (Chrome's UA-CH
// reduction, Safari's Lockdown Mode) so the matching is best-effort;
// fallback is honest.

const BROWSER_PATTERNS: Array<[RegExp, string]> = [
  // Order matters: more specific before more generic.
  // Edge (Chromium-based) before Chrome, because Edge UA contains "Chrome/"
  // and "Edg/" — checking Edge first wins.
  [/\bEdg\/\d/, "Edge"],
  [/\bOPR\/\d/, "Opera"],
  // Firefox UA does not contain "Chrome" or "Safari", so order vs them
  // doesn't matter, but listed near top for readability.
  [/\bFirefox\/\d/, "Firefox"],
  // Chrome UA contains "Chrome/" AND "Safari/". Check Chrome before Safari.
  [/\bChrome\/\d/, "Chrome"],
  // Safari UA does NOT contain "Chrome", so reaching this branch means it's
  // really Safari (or a Safari-clone like older iOS browsers using WKWebView,
  // which we accept).
  [/\bSafari\/\d/, "Safari"],
];

const OS_PATTERNS: Array<[RegExp, string]> = [
  // iPhone/iPad/iPod before macOS, because iOS UA contains "Mac OS X" too on
  // some versions. Specifically check iOS markers first.
  [/\b(iPhone|iPad|iPod)\b/, "iOS"],
  [/\bMac OS X\b/, "macOS"],
  [/\bAndroid\b/, "Android"],
  // Windows / Linux are mutually exclusive in real UAs.
  [/\bWindows NT\b/, "Windows"],
  [/\bLinux\b/, "Linux"],
];

/**
 * Derive a short human-readable device label from a User-Agent string.
 * Returns "this device" if the UA doesn't match known patterns (honest
 * fallback — matches copy.md's Connected device NULL fallback).
 */
export function deriveDeviceLabel(userAgent: unknown): string {
  if (typeof userAgent !== "string" || userAgent.length === 0) {
    return "this device";
  }
  const browser = matchFirst(userAgent, BROWSER_PATTERNS);
  const os = matchFirst(userAgent, OS_PATTERNS);
  if (browser && os) return `${browser} on ${os}`;
  if (browser) return browser;
  if (os) return os;
  return "this device";
}

function matchFirst(input: string, patterns: Array<[RegExp, string]>): string | null {
  for (const [pattern, label] of patterns) {
    if (pattern.test(input)) return label;
  }
  return null;
}
