# CB-6.7 — Copy (verbatim)

_UX Writer artifact. VERBATIM (refusal rule #5). The cards keep their CB-6.1/6.2 copy; CB-6.7 only adds a paper marker + makes the figures consistent._

## Paper marker (Profit/Loss + Current Position cards, while LIVE_MODE=false)
- Marker text: `Paper` (a small badge/label next to the section heading)
- (Mirrors the Manual Overrides card's `Paper mode — orders are simulated (dry-run).` tone; the cards already carry the section labels `PROFIT / LOSS` and `CURRENT POSITION` from CB-6.1/6.2.)

## Unchanged copy
- All existing CB-6.2 Profit/Loss labels + signed-PnL formatting and CB-6.1 Current Position labels are unchanged. The only behavioural change is that the numbers now reflect the **paper** position while dark (consistent invested ↔ value ↔ P&L) and the **real** position post-flip.

## Notes for the build
- The `Paper` marker shows ONLY while `LIVE_MODE=false`; post-flip the cards show the real position with no marker.
- Do not relabel `TOTAL INVESTED` / `CURRENT VALUE` — only the data source changes.
