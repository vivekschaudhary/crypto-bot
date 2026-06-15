# CB-5.1 — Copy (verbatim)

_UX Writer artifact. VERBATIM (refusal rule #5). Same plain, calm voice as CB-5.0. The bot's own reason strings (from CB-4.1) render verbatim and are NOT rewritten here — they are operator-readable by design._

## Page
- Heading: `Decision trace`
- Back link: `← Back to dashboard`

## Live-state → trace link (added to /dashboard, AC 5)
- `View decision trace →`

## Tick header
- `{timestamp} UTC · {decision}` — decision is the literal `buy` / `sell` / `hold`
- Error marker (AC 3): ` ⚠ error` appended to the header

## Per-asset signal row
- Line 1: `{asset} {decision} rsi {rsi} ma {ma}` — rsi/ma rounded to 2 decimals; null → `—`
- Line 2: the bot's `reason` string, VERBATIM (do not rewrite)

## Error tick (AC 3)
- In place of signal rows: the `error_detail` value, VERBATIM (already sanitized at write time, CB-4.3)

## Empty state (AC 6)
- `No decisions logged yet.`

## Bounded note (AC 7)
- `Showing the 50 most recent ticks. Older ticks not shown.`

## Notes for the build
- Timestamps: `YYYY-MM-DD HH:MM UTC` (same format as CB-5.0).
- rsi/ma: 2-decimal (`58.58`); null sentinel → `—` (em dash), never `0`.
- Do NOT paraphrase the bot's `reason` or `error_detail` — they are the audit record; render exactly.
