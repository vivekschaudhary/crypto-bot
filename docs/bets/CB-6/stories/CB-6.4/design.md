# CB-6.4 — Design (Trade Log table)

_Designer artifact. Layout reference: `ETH_USD Bot — Coinbase.pdf` (the TRADE LOG table). Builds cockpit **section 6 (Trade Log)** for the viewed pair (CB-6.1's selector). Inline styles per CB-5/CB-6.x; reuses the CB-5.2 ledger table + CB-5.1 trace reasons. SSR per load._

## Section 6 — Trade Log (per the PDF, Price/Qty deferred)

```
│  TRADE LOG                          [ All statuses ▾ ]    │
│  ───────────────────────────────────────────────────────│
│  Time         Side   USD      Reason                Status│
│  06-17 00:30  —      —        hold: USD reserve …   SKIPPED│
│  06-17 00:15  buy    $25.00   —                     dry_run│
│  06-17 00:00  —      —        hold: rsi=61 … no buy SKIPPED│
│  ───────────────────────────────────────────────────────│
│  View transaction ledger →                                │
```

Columns (shipped): **Time · Side · USD · Reason · Status**. `Price · Qty` are **deferred** (see below). One chronological, newest-first table merging two row kinds for the viewed pair:

- **TRADE rows** (from `orders`): `Side` (buy/sell) · `USD` (the order `amount`) · `Status` (the raw order status — `dry_run` / `submitted` / `failed`, matching the CB-5.2 ledger). `Reason` = `—` (trade reasons live in the Signals card + `/dashboard/trace`; resolved decision below). `failed` renders red (reuse the ledger's `LOSS` color), reinforced by the status text.
- **SKIP rows** (from `signals⋈bot_ticks` where `decision='hold'` — a decision that produced no order): `Side` = `—` · `USD` = `—` · `Reason` = the `signals.reason` **verbatim** (the "why it didn't trade" — e.g. `hold: USD reserve (need $10, available $1.77)`) · `Status` = `SKIPPED`.

The two streams are **non-overlapping** by the bot's atomic write contract (`insertTickWithDecisions`): every buy/sell signal emits exactly one order; every hold emits none. So TRADE rows cover buy/sell, SKIP rows cover holds — no double-count.

## Status filter (the PDF's "All statuses")
A labelled control (default **All statuses**) filtering the log by: **All statuses · Dry run · Submitted · Failed · Skipped**. Server-side via `?txStatus=` (SSR re-render, mirroring CB-6.1's pair selector): `skipped` → hold rows only; an order status (`dry_run`/`submitted`/`failed`) → orders with that status only; `all` → both streams merged. Filtering scopes the SQL **before** the latest-N limit (so "latest N after filter" is correct, not "N then filter").

## Scoping (resolved)
- **All-time recent per pair** (latest N, newest-first) — NOT session-scoped. Matches the decision-trace / Signals-card philosophy (a log of recent activity), and section 2 (Profit/Loss) already carries the "this run" framing. (Differs from CB-6.2; documented.)
- Includes **all** orders for the pair (bot today; future **manual overrides** from CB-6.6 will appear here automatically — no `source` filter).

## Price / Qty deferred (resolved 2026-06-17, operator)
The PDF shows `Price · Qty`, but `orders` stores only USD `amount`; real unit price + quantity live in `trade_fills`, which populate **only for live fills**. In dark mode (`LIVE_MODE=false`) every order is `dry_run` with no fill, so Price/Qty have no honest value. CB-6.4 ships `Time·Side·USD·Reason·Status`; **Price·Qty (from `trade_fills`) is a post-LIVE_MODE-flip follow-up**. Not a silent omission — documented.

## States (don't blank the cockpit)
- **Activity present** → the table (trades + skips, newest-first, latest N).
- **No activity for the pair** → `No activity yet for this pair.`
- **Filter matches nothing** → `No matching activity for this pair.`
- DB-only read → no Coinbase failure mode.

## Accessibility
- `Status` is text (`dry_run`/`submitted`/`failed`/`SKIPPED`); the `failed` red is reinforcement, not the sole signal.
- The status filter is a labelled `<select>`; the table has a header row.

## Out of scope (design)
- `Price · Qty` columns (post-flip — see decision); Run-now (CB-6.5); real-money manual overrides (CB-6.6 — though their order rows will appear here once they exist). Buy/sell per-row reasons (skips-only — resolved). No migration, no write-path change.
