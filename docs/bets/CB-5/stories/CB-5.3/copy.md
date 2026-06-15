# CB-5.3 — Copy (verbatim)

_UX Writer artifact. VERBATIM (refusal rule #5). Plain, calm; the control labels are imperative verbs; the reset confirm is reassuring (history is safe)._

## Buttons
- Pause: `Pause`
- Resume: `Resume`
- Reset: `Reset session`

## Helper note (under the controls, AC 7)
- `Pause takes effect on the next 15-minute tick.`

## Reset confirm (inline, AC 6)
- Prompt: `Reset session? This starts a fresh session. Your transaction history is kept.`
- Confirm button: `Reset`
- Cancel button: `Cancel`

## Pending / error
- Pending (button label while the request is in flight): `Working…`
- Error line (POST failed): `Couldn't update the bot. Try again.`

## Notes for the build
- The status words shown in the Bot status panel (`Active` / `Paused`) are CB-5.0 copy — unchanged here.
- "Reset session" (button) vs "Reset" (the confirm action) — both verbatim as above.
- No success toast — the live-state re-render IS the confirmation (the status + activity update on refresh).
