# CB-6.5 — Design (Run Now)

_Designer artifact. Layout reference: `ETH_USD Bot — Coinbase.pdf` (the Run Now control in the Bot Status row). Enables the **disabled "Run Now" button** shipped in CB-6.0 (`bot-controls-client.tsx`). Mostly an action + feedback story; reuses the CB-5.3 override controls' phase pattern. Copy VERBATIM (refusal rule #5)._

## The control (cockpit section 1 — Bot Status controls)

The Bot Status row already has **Start · Pause · Stop** (live) + **Run Now** (disabled "Coming soon" in CB-6.0). CB-6.5 enables **Run Now**:

```
│  BOT STATUS                                               │
│  Bot is active — running every 15 minutes.   ● ACTIVE     │
│  [ Start ]  [ Pause ]  [ Stop ]  [ Run Now ]              │
│                                   ↑ now enabled            │
│  Running…  /  Done — see the trade log.  /  Bot is paused …│
└───────────────────────────────────────────────────────────┘
```

- **Run Now** triggers ONE on-demand bot evaluation (the same logic the `*/15` cron runs), **dry-run while `LIVE_MODE=false`** (no bypass). On success the cockpit refreshes (`router.refresh()`) so the new tick's effects show in **Signals** (6.3) and the **Trade Log** (6.4).
- Reuses the CB-5.3 controls' **phase** pattern (`idle → working → idle/error`), extended with a "skipped" outcome:
  - **idle** → button enabled.
  - **working** → "Running…" (button disabled during the request — prevents double-fire).
  - **success** → brief "Done — see the trade log." then the cockpit refreshes.
  - **skipped** (bot paused/stopped → the tick handler skips, same as cron) → "Bot is paused — resume to run." (no silent no-op).
  - **error** (auth/network/rate-limit) → "Run failed — try again."

## States
- **Active session** → Run Now runs a fresh evaluation; cockpit refreshes.
- **Paused / stopped** → Run Now is allowed but the evaluation skips → the "Bot is paused — resume to run." feedback (honest; the operator learns why nothing changed).
- **Rate-limited / error** → "Run failed — try again." (reuse the override controls' error treatment).
- **In flight** → button disabled + "Running…" (no double-submit).

## Accessibility
- The button loses `disabled`/`aria-disabled`; feedback is text (not color/spinner only).
- Keyboard-operable `<button>` (matches the existing Start/Pause/Stop).

## Out of scope (design)
- Real-money overrides (Buy/Sell — CB-6.6). **Post-LIVE_MODE-flip**, Run Now respects `LIVE_MODE` and would place REAL orders on click (bounded by the session caps) — a real-money **confirmation** UX is deferred to CB-6.6 (the real-money story, Security Reviewer). CB-6.5 ships dark (dry-run), so no confirmation in scope now.
