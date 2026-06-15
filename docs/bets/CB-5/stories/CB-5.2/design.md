# CB-5.2 — Design (transaction ledger + per-asset PnL)

_Designer artifact. Reuses the CB-5.0/5.1 shell + `LiveModeBanner` + inline-styles. Desktop-first._

## Surface: `/dashboard/ledger`

```
┌──────────────────────────────────────────────────────────┐
│  crypto-bot                                  [ Sign Out ]  │   ← chrome
├──────────────────────────────────────────────────────────┤
│  ▟▟▟  DRY RUN — paper trading. … ▟▟▟                      │   ← LiveModeBanner
├──────────────────────────────────────────────────────────┤
│  Transaction ledger        ← Back to dashboard · Decision trace│  ← nav (cross-links)
│                                                            │
│  Profit / loss  (from your Coinbase fills + current price) │   ← PnL panel (AC 3)
│    BTC-USD   0.0123 @ avg $42,010   now $43,100            │
│              realized +$12.40   ·   unrealized +$13.41     │   ← sign + color, text-labeled
│    ETH-USD   no position   ·   realized −$3.10             │
│    …                                                       │
│                                                            │
│  Transactions                                              │   ← orders table (AC 3/4/5)
│    time            asset    src   side  amount   status    │
│    06-14 17:00 UTC BTC-USD  bot   buy   $50.00   dry_run   │
│    06-13 09:15 UTC ETH-USD  bot   sell  $48.20   submitted │
│    …                                                       │
│  Showing the 50 most recent transactions. Older not shown. │   ← bounded note (AC 10)
└──────────────────────────────────────────────────────────┘
```

## PnL panel (AC 3 / AC 7)
- Heading `Profit / loss` + caption `From your Coinbase fills + current price` (data-honesty, AC 7).
- Per asset: `{qty} @ avg ${avgCost}  now ${currentPrice}` then `realized {±$x} · unrealized {±$y}`.
- **Gains/losses**: green for ≥ 0, red for < 0 — but ALWAYS with the sign (`+`/`−`) and the number, never color-alone (accessibility). `unrealized —` when current price unavailable (AC 6/8). `no position` for assets not held (realized may still show).
- Degraded (Coinbase failed): the whole panel → `PnL unavailable — couldn't reach Coinbase. Transactions below are unaffected.`

## Transactions table (AC 3/4/5)
- Columns: time (UTC) · asset · **src** (`manual`/`bot`) · side (`buy`/`sell`) · amount (USD) · **status**.
- **status** is the per-execution paper/live indicator (brief Decision #7): `dry_run` (muted/neutral = paper), `submitted` (live — subtle emphasis), `failed` (muted-red, text-labeled). Never color-only.
- Empty: `No transactions yet.`

## Accessibility
- Semantic table for transactions; sign + number carry PnL meaning (color reinforces). status + source are text. WCAG AA contrast.

## Out of scope (design)
- PnL time-series / charts; trade_fills detail; pagination UI; filtering. Override controls = CB-5.3.
