# CB-5.2 — Copy (verbatim)

_UX Writer artifact. VERBATIM (refusal rule #5). Plain, calm voice, consistent with CB-5.0/5.1._

## Page
- Heading: `Transaction ledger`
- Nav: `← Back to dashboard` · `Decision trace`
- Live-state → ledger link (added to /dashboard): `View transaction ledger →`

## PnL panel
- Heading: `Profit / loss`
- Caption: `From your Coinbase fills + current price`
- Per asset, held: `{qty} @ avg ${avgCost}  now ${currentPrice}` then `realized {±$realized} · unrealized {±$unrealized}`
- Per asset, no open position: `no position · realized {±$realized}`
- Unrealized unavailable (no current price): `unrealized —`
- Empty (no holdings/PnL): `No open positions.`
- Degraded (Coinbase failed): `PnL unavailable — couldn't reach Coinbase. Transactions below are unaffected.`

## Transactions table
- Heading: `Transactions`
- Column headers: `Time` · `Asset` · `Source` · `Side` · `Amount` · `Status`
- Source values: `manual` / `bot` (verbatim from `orders.source`)
- Side values: `buy` / `sell`
- Status values: `dry_run` / `submitted` / `failed` (verbatim from `orders.status`)
- Empty: `No transactions yet.`

## Bounded note
- `Showing the 50 most recent transactions. Older transactions not shown.`

## Notes for the build
- USD: thousands separators + 2 decimals (`$42,010.00`); PnL with explicit sign: `+$12.40` / `−$3.10` (use the minus sign `−` or `-` consistently — Engineer DRI, but always signed).
- `unrealized —` uses the em dash for the null-price case (consistent with CB-5.1).
- Timestamps: `YYYY-MM-DD HH:MM UTC`.
- Render `orders.status` / `orders.source` values verbatim — they're the audit record.
