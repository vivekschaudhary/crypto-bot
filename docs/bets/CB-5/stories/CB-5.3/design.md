# CB-5.3 — Design (safe override controls)

_Designer artifact. Controls live on the existing `/dashboard` live-state home (no new route). Reuses chrome + inline styles. The buttons sit with the Bot status panel — the operator pauses/resumes/resets right where they read the status._

## Placement: `/dashboard` — Bot status panel + controls

```
│  Bot status                                                │
│    ● Active   ·   session started 2026-06-12 21:45 UTC     │
│    [ Pause ]   [ Reset ]                                   │   ← status='active' → Pause + Reset
│                                                            │
│    (when paused:)                                          │
│    ⏸ Paused   ·   session started …                        │
│    [ Resume ]  [ Reset ]                                   │   ← status='paused' → Resume + Reset
│                                                            │
│    Pause takes effect on the next 15-minute tick.          │   ← helper note (AC 7)
```

## Buttons
- Real `<button>` elements (keyboard + screen-reader operable), in a Client Component (`override-controls-client.tsx`) that POSTs to `/api/bot/override` and calls `router.refresh()` on success so the SSR live-state re-renders with the new status + re-anchored activity.
- **Status-aware**: Pause shown only when `active`; Resume only when `paused`; Reset always.
- Visual weight: Pause/Resume neutral; **Reset** is the destructive-ish action → slightly de-emphasized + a **confirm step** (AC 6) before firing (it re-anchors "this session"). A simple inline confirm ("Reset session? This starts a fresh session. Your transaction history is kept." → Confirm / Cancel) — no heavy modal needed for single-operator MVP.
- Disabled/pending state while the POST is in flight (prevent double-submit).
- Error: if the POST fails (401/500), show an inline error line ("Couldn't update the bot. Try again.") — non-destructive, the status is unchanged.

## Reset confirm
- Inline (not a route change): clicking Reset swaps the button for a confirm/cancel pair + the explanation. Confirm fires the POST; Cancel restores.

## Accessibility
- Buttons have text labels (not icon-only). Status is conveyed by text (`Active`/`Paused`) + the dot, not color alone. Confirm is keyboard-navigable. Pending/disabled state is `aria-disabled`/`disabled`.

## Out of scope (design)
- force-buy / sell-N buttons (CB-5.4). Toasts/animations. A dedicated controls page (controls stay on the live-state home).
