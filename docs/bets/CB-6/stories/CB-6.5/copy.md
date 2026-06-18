# CB-6.5 — Copy (verbatim)

_UX Writer artifact. VERBATIM (refusal rule #5). Anchored to `ETH_USD Bot — Coinbase.pdf` (Run Now control). Reuses the CB-5.3 controls' feedback tone._

## Run Now control
- Button label: `Run Now` (unchanged from CB-6.0)

## Feedback states
- Working (request in flight): `Running…`
- Success (evaluation ran): `Done — see the trade log.`
- Skipped (bot paused/stopped — the evaluation does not run): `Bot is paused — resume to run.`
- Error (auth / network / rate-limited): `Run failed — try again.`

## Notes for the build
- On success, refresh the cockpit (`router.refresh()`) so the new tick shows in Signals (6.3) + the Trade Log (6.4); the brief feedback line may clear on refresh.
- Run Now respects `LIVE_MODE` (no bypass): while dark it records `dry_run` orders, exactly like the cron tick. Do NOT add a dry-run-only path.
- The "skipped" feedback fires when the current session is paused/stopped (the tick handler skips) — surface it; never a silent no-op.
