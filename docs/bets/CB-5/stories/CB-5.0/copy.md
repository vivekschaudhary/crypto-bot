# CB-5.0 — Copy (verbatim)

_UX Writer artifact. Strings are VERBATIM — the build uses them exactly as written (Compass refusal rule #5: do not paraphrase UX Writer copy). Voice: plain, calm, operator-to-operator; no hype; the LIVE banner is the one place that raises its voice. American English, sentence case for body, UPPER for the two mode words only._

## LIVE_MODE banner (AC 3)

- **Dry-run** (`LIVE_MODE=false`):
  `DRY RUN — paper trading. The bot logs decisions but places no real orders.`
- **Live** (`LIVE_MODE=true`):
  `● LIVE — real orders. The bot is placing real Coinbase orders with real money.`

## Section headings (AC 2)
- `Bot status`
- `Holdings`
- `This session`

## Bot status panel
- Active: `● Active` · suffix: ` · session started {timestamp} UTC`
- Paused: `⏸ Paused` · suffix: ` · session started {timestamp} UTC`
- Reset: `↺ Reset` · suffix: ` · session started {timestamp} UTC`
- _(timestamp format: `YYYY-MM-DD HH:MM` UTC)_

## Holdings panel
- Caption (under the heading): `From your Coinbase fills`
- Per-asset, holds a position: `{quantity} {base} · avg cost ${avgCost}`  _(e.g. `0.0123 BTC · avg cost $42,010.00`)_
- Per-asset, no position: `no position`
- Empty (zero holdings across all assets): `No positions yet.`
- Degraded (Coinbase fetch failed, AC 4): `Holdings unavailable — couldn't reach Coinbase. Status and session activity below are unaffected.`

## This session panel
- With activity: `{n} bot buys · ${total} invested {modeTag}`  _(e.g. `3 bot buys · $150.00 invested (paper)`)_
  - singular: `1 bot buy · ${total} invested {modeTag}`
  - modeTag: `(paper)` when `LIVE_MODE=false`, `(live)` when `LIVE_MODE=true`
- Empty (zero bot orders this session): `No bot orders this session yet.`

## No active session (AC 5)
- Message: `No active session. Save a strategy to start the bot.`
- Link (reuses the existing strategy entry point): `Create or revise your DCA strategy`

## Notes for the build
- Numbers: USD with thousands separators + 2 decimals (`$42,010.00`); quantities at the asset's natural precision (no forced trailing zeros).
- The mode tag `(paper)`/`(live)` is intentionally redundant with the banner — reinforcing "is this real?" at the data level is the point, not an accident.
- Preserve the existing CB-1.6 / CB-3.3 strings already on the page (Sign Out, the `?strategy=saved` success banner "Strategy saved. Bot will pick it up on the next tick.", connected-device line) — this story does not change them.
