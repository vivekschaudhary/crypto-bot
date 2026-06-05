---
id: CB-1.6-copy
bet: CB-1
story: CB-1.6
type: copy
status: draft
created: 2026-06-03
author: UX Writer
voice: terse, direct, operator-aware (no marketing tone; no apologetic tone)
forbidden: paraphrasing, embellishment, "please" / "we're sorry" softeners, second-person "you" in error states
---

# CB-1.6 — Copy doc (use verbatim per AGENTS.md principle #10)

> **Engineer reading this:** use these strings **verbatim**. Do not paraphrase. Do not pluralize. Do not add or remove punctuation. If something here feels wrong for the rendered context, file a Dispute on the PR per `/build` Phase 5 step 17; do not silently edit.

## Voice notes

- **Audience is n=1 operator.** They know what crypto-bot is, what passkeys are, and what's about to happen. No tooltips, no explainers, no "Welcome to crypto-bot."
- **No second person in error states.** "Passkey registration failed" — not "Your passkey registration failed." Avoids parental tone.
- **No apologies.** Don't say "Sorry" or "Oops." Errors get a name + a next action.
- **Sentence case for headings and buttons.** No title case. No all-caps.
- **No exclamation marks anywhere.** Including the success state.

## `/` (landing)

### Header (all states)
```
crypto-bot · operator console
```

### State A — Zero credentials (first deploy)

**Body:**
```
This instance hasn't been set up yet.
```

**CTA button:**
```
Set up your passkey
```

### State B — One or more credentials (returning operator)

**Body:** (none — just the header and the CTA)

**CTA button:**
```
Sign in
```

### State C — Authenticated session
SSR redirect to `/dashboard`. No visible copy.

## `/setup`

### Header
```
crypto-bot · setup
```

### Body (intro)
```
Register your passkey to control this instance.
```

### Body (caveat)
```
Once registered, this passkey will be the only way to access your Coinbase trade controls. Make sure the device you're on is one you trust.
```

### CTA button (idle)
```
Register passkey
```

### CTA button (in-flight)
```
Waiting for passkey…
```

(Note: ellipsis is the unicode single character `…`, not three periods. Engineer: use the Unicode character.)

### Success transient
```
Passkey registered
```

Renders for ~400ms then auto-navigates to `/dashboard`.

### Error messages (typed; map by error code from `/api/auth/register/*`)

| Error condition | Copy |
|---|---|
| Browser does not support WebAuthn | `This browser doesn't support passkeys. Try Safari (macOS / iOS) or Chrome (any platform).` |
| User cancelled the passkey prompt | `Passkey registration cancelled.` |
| WebAuthn ceremony failed (`verification-failed` from server) | `Passkey registration failed. Try again, or pick a different device.` |
| Registration disabled — `count(auth_credentials) >= 1` race (409 from `/api/auth/register/finish` per CB-1.2 migration 0002 catch path) | `This instance already has a passkey registered. Go to sign in.` (CTA: link to `/sign-in`) |
| Rate-limited (429 from `/api/auth/register/begin`) | `Too many setup attempts. Wait a minute and try again.` |
| Origin mismatch (403) | `Setup blocked: this page must run on the deployed instance, not a local copy.` |
| Network failure / unknown 5xx | `Setup failed. Check your connection and try again.` |

## `/sign-in`

### Header
```
crypto-bot · sign in
```

### Body
```
Welcome back. Use your passkey to continue.
```

### CTA button (idle)
```
Sign in with passkey
```

### CTA button (in-flight)
```
Waiting for passkey…
```

### Success transient
```
Signed in
```

Renders ~400ms then auto-navigates to validated `next` OR `/dashboard`.

### Footer (always visible)
```
Operator-only access. Lost your passkey? See the runbook — recovery requires direct DB access.
```

(No clickable link to the runbook. Plain text. The operator knows where it is; an external visitor doesn't need one.)

### Error messages

| Error condition | Copy |
|---|---|
| Browser does not support WebAuthn | `This browser doesn't support passkeys. Try Safari (macOS / iOS) or Chrome (any platform).` |
| User cancelled the passkey prompt | `Sign-in cancelled.` |
| WebAuthn ceremony failed (`verification-failed`) | `Sign-in failed. Try again, or check that the passkey is on this device.` |
| Counter replay detected (400 `counter-replay-detected`) | `Sign-in blocked: this passkey appears to have been replayed. Check the runbook.` |
| Rate-limited (429) | `Too many sign-in attempts. Wait a minute and try again.` |
| Origin mismatch (403) | `Sign-in blocked: this page must run on the deployed instance, not a local copy.` |
| Network failure / unknown 5xx | `Sign-in failed. Check your connection and try again.` |

## `/dashboard` (minimal post-auth landing)

### Header
```
crypto-bot
```

### Top-right action button
```
Sign out
```

### Body — primary line
```
Signed in.
```

### Body — placeholder line
```
Bot controls and decision trace will arrive in the next bet (CB-2).
```

### Connected device line (small, secondary)
```
Connected device: {device_label}
```

(Engineer: `{device_label}` is the `auth_credentials.device_label` value for the credential used in the current session. Format: whatever was auto-detected from `navigator.userAgent` at registration. If the field is NULL/empty for some reason, render `Connected device: this device` as the fallback.)

### Sign-out in-flight (button label)
```
Signing out…
```

### Sign-out error (rare)

| Error condition | Copy |
|---|---|
| Origin mismatch (403) | `Sign-out blocked. Try again from the deployed instance.` |
| Network failure / 5xx | `Sign-out failed. Try again.` |
| 401 (session already invalidated server-side mid-flight) | (no error rendered — client treats this as success-equivalent and navigates to `/`) |

## Cross-surface strings (used by all auth pages)

### Validation error in `?next=` (post-CB-1.4 emit, post-CB-1.6 consumer revalidate)

When the `?next=` parameter on inbound to `/sign-in` fails the allowlist validation, the parameter is **silently dropped**. No error copy is rendered — the operator just doesn't get redirected to the invalid target. This matches the security-review HIGH finding closure on PR #10: the consumer is defense-in-depth on the emit-side guard; the operator shouldn't see "your ?next was malicious" text because the legit operator never crafts a malicious one.

(Engineer note: log the rejection to console.warn in dev so debugging is possible; do not surface to the user in production.)

## Copy decisions (DRI Log additions for the story)

1. **No second-person "your" in error states.** Standard operator-aware product voice — errors describe what happened, not who's at fault.
2. **No exclamation marks anywhere.** Including success states. Operator-only product; the operator doesn't need cheerleading.
3. **No marketing-style "Welcome to crypto-bot" or "Take control of your crypto" anywhere.** Operator already knows what this is.
4. **Footer on `/sign-in` references the runbook in plain text without a link.** The runbook lives in the repo; clickable links would 404 for any visitor who shouldn't be there anyway.
5. **The "Bot controls coming in CB-2" copy is forward-explicit per AGENTS.md principle #3.** Naming what's not yet here keeps the operator's mental model accurate.
6. **`Connected device: this device` is the fallback when `device_label` is NULL.** Matches the auto-detect-from-UA decision; "this device" is honest when we couldn't capture a label.

## Out of scope (this copy doc)

- Localization / i18n strings — n=1 operator picks at build.
- Email templates / push notifications — not in scope this bet.
- Bot status / trade controls / decision trace copy — CB-2.
- Settings / preferences / account-management copy — post-MVP.
- Onboarding tutorial / first-time-tooltip copy — out per design ("no explainers").
