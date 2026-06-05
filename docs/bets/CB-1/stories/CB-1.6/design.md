---
id: CB-1.6-design
bet: CB-1
story: CB-1.6
type: design
status: draft
created: 2026-06-03
author: Designer
---

# CB-1.6 — First-deploy onboarding UX (Design)

## Scope of this design

This design covers the three new operator-facing surfaces introduced by CB-1.6 plus the post-auth dashboard's minimal content. All four are produced by this story:

1. **`/` (landing)** — thin entry; mode-detecting CTA.
2. **`/setup`** — first-deploy passkey registration ceremony.
3. **`/sign-in`** — passkey authentication ceremony; honors `?next=`.
4. **`/dashboard`** — signed-in landing with sign-out trigger + "Bot status coming in CB-2" placeholder.

## Product framing

Single-operator, n=1, no third-party identity provider in the auth path. The operator builds, deploys, and uses this product alone. There is no acquisition funnel, no growth surface, no marketing — the "landing page" exists because Next.js needs a `/` route and the operator may share the URL with one trusted person (themselves, a tax accountant, etc.) who briefly needs to land somewhere reasonable.

The UX bar is **"the operator can register a passkey on a freshly-deployed instance and reach `/dashboard` in under 5 minutes"** (CB-1 brief guardrail #2). Beyond that bar, restraint is the design ethos — less surface to maintain.

## Surface 1 — `/` (landing)

### Layout

Single centered card on a neutral background. The card has three states selected by server-side render based on `count(auth_credentials)` + session state:

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│            crypto-bot · operator console            │
│            ─────────────────────────────            │
│                                                     │
│       [STATE-DEPENDENT BODY — see below]            │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### Three states

**State A — Zero credentials registered (first deploy):**
```
crypto-bot · operator console
─────────────────────────────

This instance hasn't been set up yet.

         ┌──────────────────────┐
         │  Set up your passkey │
         └──────────────────────┘
                  ↓
              navigates to /setup
```

**State B — One or more credentials registered (returning operator):**
```
crypto-bot · operator console
─────────────────────────────

         ┌──────────────────────┐
         │       Sign in        │
         └──────────────────────┘
                  ↓
              navigates to /sign-in
              (preserves ?next= if present on inbound)
```

**State C — Authenticated session:**
```
SSR redirect to /dashboard (302) — no card rendered.
```

### Implementation notes (Designer → Engineer handoff)

- `/` is a Server Component. At request time it (a) reads the `__compass_session` cookie via `verifySession`, (b) if authenticated → `redirect('/dashboard')`, (c) else queries `db().auth_credentials` for `count(*)` and renders State A or State B.
- The CB-1.4 `?next=<encoded>` parameter, if present on inbound to `/`, is forwarded to `/sign-in` via a query string on the State B CTA's `href`. State A's `/setup` CTA does NOT forward `?next` (registration completes by signing in immediately; the redirect happens post-setup, not post-auth).
- Server-side credential count is allowed to be a read-only SELECT — no write side-effects on `/` (unlike the `verifySession` sliding-expiry).

### Why not show marketing copy

n=1 operator-only product. The brief explicitly scopes this as "single-operator personal use" (foundation/product.md §40). No acquisition surface; no value in describing what crypto-bot does on `/`. State A's "This instance hasn't been set up yet" is the closest the landing gets to product framing — and it's there because the alternative is showing a "Set up your passkey" CTA with zero context.

## Surface 2 — `/setup` (first-deploy passkey registration)

### Pre-render gate

`/setup` is reachable ONLY when `count(auth_credentials) = 0`. If `count >= 1`, SSR redirects to `/sign-in` (consistent with CB-1.2's first-time-only API gate; UI mirrors the back-end invariant).

If reached with an active session (operator already signed in, edge case), redirect to `/dashboard`.

### Layout

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│            crypto-bot · setup                       │
│            ──────────────────                       │
│                                                     │
│   Register your passkey to control this instance.   │
│                                                     │
│   Once registered, this passkey will be the only    │
│   way to access your Coinbase trade controls.       │
│   Make sure the device you're on is one you trust.  │
│                                                     │
│         ┌──────────────────────────┐                │
│         │   Register passkey       │                │
│         └──────────────────────────┘                │
│                                                     │
│   ─────────────────────────────────                 │
│                                                     │
│   [error region — appears only on failure]          │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### States

1. **Idle (default):** "Register passkey" button is enabled.
2. **In-flight (browser passkey prompt open):** button shows spinner + label "Waiting for passkey..." — disabled while the WebAuthn ceremony runs.
3. **Success:** card briefly shows "Passkey registered" + auto-navigates to `/dashboard` (the registration ceremony at `/api/auth/register/finish` already creates a session per CB-1.2's architecture).
4. **Error (WebAuthn failure / user-cancel / cred already exists race / browser-not-supported):** error region renders one of the typed error messages from copy.md; button re-enables to allow retry.

### Implementation notes

- Button onClick → `fetch POST /api/auth/register/begin`, browser-side `startRegistration()` from `@simplewebauthn/browser`, then `fetch POST /api/auth/register/finish` with the attestation response.
- Device label: auto-derived from `navigator.userAgent` at registration time (per PM Decision in story DRI — n=1 product doesn't justify a form field).
- After `/api/auth/register/finish` returns 200, client-side `router.push('/dashboard')` (the response sets the session cookie; the next request will pass proxy gate).

### Why no form fields

n=1 operator. No account-creation flow (no email, no username, no display name). The passkey IS the credential. The only required user input is the browser's passkey UI itself (Touch ID, Face ID, security key, etc.) — which the WebAuthn ceremony surfaces natively.

## Surface 3 — `/sign-in` (passkey authentication)

### Pre-render gate

`/sign-in` is reachable when `count(auth_credentials) >= 1`. If `count = 0`, SSR redirect to `/setup` (analogous symmetry with `/setup`'s gate).

If reached with an active session, redirect to `/dashboard` (or `?next=` if present + valid — see below).

### `?next=` handling (consumer side; defense-in-depth per CB-1.4 emit-side contract)

`/sign-in?next=<encoded>` accepts the query parameter on inbound from CB-1.4's proxy redirect. **Before any navigation honors it, the consumer revalidates:**

1. Reject if `next` does not start with `/` (relative same-origin only).
2. Reject if `next` starts with `//` (protocol-relative URL — open-redirect to attacker domain).
3. Reject if `next` contains `\` (some routers normalize backslash to forward slash).
4. Reject if `next` contains `:` before the first `/` (catches `javascript:`, `data:`, etc.).

On rejection, the parameter is silently dropped — post-sign-in redirect falls back to `/dashboard`. CB-1.4's emit side already pre-filters; this is belt-and-braces per the security review BLOCKER closure on PR #10.

### Layout

```
┌─────────────────────────────────────────────────────┐
│                                                     │
│            crypto-bot · sign in                     │
│            ────────────────────                     │
│                                                     │
│       Welcome back. Use your passkey to continue.   │
│                                                     │
│         ┌──────────────────────────┐                │
│         │   Sign in with passkey   │                │
│         └──────────────────────────┘                │
│                                                     │
│   ─────────────────────────────────                 │
│                                                     │
│   [error region — appears only on failure]          │
│                                                     │
│   ─────────────────────────────────                 │
│                                                     │
│   Operator-only access. Lost your passkey? See      │
│   the runbook — recovery requires direct DB access. │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### States

1. **Idle:** "Sign in with passkey" button enabled.
2. **In-flight:** spinner + "Waiting for passkey..." — disabled.
3. **Success:** brief "Signed in" — auto-navigate to `next` (validated) OR `/dashboard`.
4. **Error:** typed error message + retry. WebAuthn errors fall into the same buckets as `/setup` but the "cred already exists" race doesn't apply (we expect cred to exist).

### Implementation notes

- Button → `fetch POST /api/auth/authenticate/begin`, browser `startAuthentication()`, then `POST /api/auth/authenticate/finish`.
- On 200, the response sets the session cookie; `router.push(safeNext || '/dashboard')`.
- The runbook reference in the footer is plain text, no link — it points at `docs/ops/runbook.md` which lives in the repo. The operator knows where it is; an actual user-facing link would only confuse external visitors (of whom there are none).

## Surface 4 — `/dashboard` (minimal post-auth landing)

### Scope (this story)

Real dashboard content — bot status, recent trades, decision trace, manual overrides — is **CB-2 territory**. CB-1.6 ships just enough `/dashboard` to:

1. Prove auth worked (operator visibly lands here after sign-in/register).
2. Provide a sign-out trigger (closes the auth UX loop CB-1.5 opened server-side).
3. Set the expectation that real content is coming.

### Layout

```
┌─────────────────────────────────────────────────────┐
│ crypto-bot                       [ Sign out ] →     │
│ ──────────────────────────────────────────────────  │
│                                                     │
│   Signed in.                                        │
│                                                     │
│   Bot controls and decision trace will arrive in    │
│   the next bet (CB-2).                              │
│                                                     │
│   ────────────────────────────                      │
│                                                     │
│   Connected device: [user-agent string excerpt]     │
│                                                     │
└─────────────────────────────────────────────────────┘
```

### States

1. **Default:** signed-in card + sign-out button.
2. **Sign-out in-flight:** sign-out button shows spinner + "Signing out..." — disabled.
3. **Sign-out success:** client-side `router.push('/')` after the `POST /api/auth/sign-out` returns 200 (the response Set-Cookie clears the session; next request fails the proxy gate and goes through the new `/` landing).
4. **Sign-out error (rare — 403 origin mismatch, network failure):** typed error; button re-enables.

### Implementation notes

- Page is server-rendered with the operator's `x-session-user-id` available from proxy's cloned-request-headers (per CB-1.4 Engineer Decision — handlers MUST NOT trust these as auth claims, but they're fine for rendering convenience).
- Sign-out button is a client component that fires `fetch POST /api/auth/sign-out`.
- "Connected device" string is read from `auth_credentials.device_label` for the credential used in the current session. This is a UI-only confirmation; not a security claim.
- The "Bot controls coming in CB-2" copy is **forward-explicit per AGENTS.md principle #3** (no silent skips — we're naming what the dashboard doesn't have yet).

## Accessibility checklist (this design)

- **Focus management:** on each page load, focus moves to the primary CTA button (`/`, `/setup`, `/sign-in`) or to the sign-out button (`/dashboard`). The WebAuthn browser prompt manages its own focus when it opens.
- **Keyboard navigation:** Tab to focus the primary CTA; Enter to activate. Esc dismisses any rendered error region.
- **Screen reader labels:** every interactive element has an explicit accessible name (button text). The error region uses `role="alert"` so SR announces failures immediately.
- **Contrast:** all text meets WCAG 2.1 AA on the neutral background palette (specific Tailwind tokens determined at implementation; design-system defaults from existing `app/layout.tsx` should already satisfy).
- **Reduced motion:** any transition between idle/in-flight/success states honors `prefers-reduced-motion: reduce` (no animated spinners; substitute a static "Waiting..." text).

## Cross-surface consistency

Single web target (Vercel + Next.js 16). No mobile / native surface; no consistency burden across stacks. Within the web target, all four surfaces share the same card layout primitive, the same neutral palette, and the same button + error region components — minimal divergence by design.

## Out of scope (this design)

- Bot status, trade history, decision-trace UI — CB-2.
- Settings / account UI (e.g., "rename device", "rotate session secret") — post-MVP.
- Multi-device passkey enrollment UI — post-MVP per portfolio scope.
- Backup recovery code redemption UI — post-MVP per portfolio scope.
- WebAuthn conditional-UI / autocomplete affordance — post-MVP per CB-1 brief out-of-scope list.
- Marketing copy / product description on `/` — n=1 product; no funnel.
- Theme switching, internationalization — n=1 product, operator picks once at build.

## Design decisions (DRI Log additions for the story)

Each below is decided by Designer for the design; PM will mirror to the story DRI Log with rationale.

1. **Single card layout primitive across all four surfaces.** Reduces visual + code surface; matches the n=1 operator-only ethos.
2. **No marketing copy on `/` even after Split option chosen.** Split provides route structure; doesn't require marketing content. The card stays minimal until the product needs an acquisition surface (never, per current portfolio scope).
3. **Auto-redirect after `/setup` success rather than showing a "registered, continue" button.** Reduces friction on the < 5-min guardrail; the registration ceremony already creates a session, so the next page is reachable without a second click.
4. **`/dashboard` ships "Connected device: <user-agent excerpt>" rather than a labeled device name.** Mirrors the device-labeling decision (auto-detect, no form field). When multi-device returns, the UI can switch to showing the labeled name.
5. **Sign-out button placement: top-right of dashboard, not in a settings menu.** n=1 means there's no settings menu yet; promoting sign-out to the primary chrome makes the loop visible.
