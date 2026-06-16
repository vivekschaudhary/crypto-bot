# CB-6.0 — Copy (verbatim)

_UX Writer artifact. VERBATIM (refusal rule #5 — the Engineer uses these strings exactly). Anchored to the operator's `ETH_USD Bot — Coinbase.pdf`; new strings authored where the PDF doesn't cover a state. Reuses CB-5.3's pending/error copy for consistency._

## Top nav (tabs) — verbatim from the PDF
- `📊 Mutual Funds`
- `📈 Equity`
- `🤖 Crypto`

## Page eyebrow + title
- Eyebrow (verbatim): `DCA + SIGNAL EXIT · COINBASE`
- Title (CB-6.0 — generic; per-pair title arrives in CB-6.1): `Crypto Trading Bot`

## "Coming soon" placeholders (Mutual Funds + Equity tabs)
- Equity: `Equity trading is coming soon.`
- Mutual Funds: `Mutual funds are coming soon.`
- Back affordance: `← Back to Crypto`

## Cockpit section labels (CB-6.0 builds "Bot status"; the rest are placeholders)
- `BOT STATUS`
- Placeholder line for the not-yet-built sections (Profit / Loss · Current Position · Signals · Manual Overrides · Trade Log): `Coming soon`

## Bot status
- State badge — running: `ACTIVE`
- State badge — not running: `STOPPED`
- One-liner (running): `Bot is active — running every 15 minutes.`
- One-liner (not running, verbatim from PDF): `Bot is stopped — click Start to resume`
- Status-detail line when stopped (verbatim from PDF): `stopped by user`

## Controls (button labels)
- `Start`
- `Pause`
- `Stop`
- `Run Now` _(rendered disabled in CB-6.0 — wired in CB-6.3)_

## Pending / error (reused from CB-5.3 for consistency)
- Pending (button label while the request is in flight): `Working…`
- Error line (POST failed): `Couldn't update the bot. Try again.`

## Notes for the build
- **STOPPED vs PAUSED:** per the operator decision **Stop = alias for `paused`** (no migration), there is one not-running state. CB-6.0 displays it as **`STOPPED`** (matching the PDF), and **both** the Pause and Stop buttons lead to it (the Pause/Stop redundancy is the design issue flagged in design.md — settle there). `Start` is the single resume action.
- Run Now is present but disabled with a "coming soon" affordance until CB-6.3.
- Status words map to `bot_sessions.status`: `active` → `ACTIVE`; `paused` → `STOPPED`.
