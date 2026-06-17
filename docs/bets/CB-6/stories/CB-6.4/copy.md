# CB-6.4 — Copy (verbatim)

_UX Writer artifact. VERBATIM (refusal rule #5). Anchored to `ETH_USD Bot — Coinbase.pdf` (TRADE LOG table). Reuses CB-5.2 ledger formatting (time, USD, `failed` red) + CB-5.1 trace reasons (verbatim)._

## Trade Log
- Section label: `TRADE LOG`
- Column headers (in order): `Time` · `Side` · `USD` · `Reason` · `Status`
  - (`Price` · `Qty` are deferred to post-live-flip — not shown in CB-6.4.)
- TRADE row cells: `Side` = `buy` / `sell`; `USD` = the order amount (`$` + thousands + 2dp, e.g. `$25.00`); `Status` = the raw order status (`dry_run` / `submitted` / `failed`); `Reason` = `—`.
- SKIP row cells: `Side` = `—`; `USD` = `—`; `Reason` = the signal reason **verbatim** (e.g. `hold: USD reserve (need $10, available $1.77)`); `Status` = `SKIPPED`.
- Time format: matches the CB-5.2 ledger (`fmtTs`).

## Status filter
- Control label: `Status`
- Default option: `All statuses`
- Options (label → filter value): `All statuses` → all · `Dry run` → dry_run · `Submitted` → submitted · `Failed` → failed · `Skipped` → skipped

## Empty states
- No activity for the viewed pair: `No activity yet for this pair.`
- A filter that matches nothing: `No matching activity for this pair.`

## Reachability
- Keep the link to the full ledger below the table: `View transaction ledger →` (→ `/dashboard/ledger`).

## Not-applicable cells
- Em dash `—` for cells that don't apply (a SKIP row's Side/USD; a TRADE row's Reason).

## Notes for the build
- `Status` shows the **raw** order status for trades (matches the ledger's `dry_run`/`submitted`/`failed`) and `SKIPPED` for hold rows. The filter option labels are title-cased (`Dry run`) but map to the raw values.
- Reasons are shown on **SKIP rows only** (resolved decision — the "why it didn't trade" case). Trade-row reasons live in the Signals card + `/dashboard/trace`. Do not paraphrase any reason string.
- All-time recent per pair (latest N), newest-first — NOT session-scoped (resolved decision).
