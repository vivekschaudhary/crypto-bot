# CB-8.1 — Copy (verbatim)

_UX Writer artifact. VERBATIM (refusal rule #5). Adds the collapse toggle + splits nav labels into icon + label (so the collapsed rail shows icons; labels stay as the accessible name)._

## Nav items (icon · label)
- `🤖` · `Crypto`  → `/dashboard`
- `📈` · `Equity`  → `/dashboard/equity`
- `📊` · `Mutual Funds`  → `/dashboard/mutual-funds`
- `⚙️` · `Strategy`  → `/dashboard/strategy`
- `🧭` · `Decision trace`  → `/dashboard/trace`
- `📒` · `Ledger`  → `/dashboard/ledger`

(The first three icons are unchanged from CB-8.0; the last three are NEW so the collapsed rail stays navigable.)

## Collapse toggle
- `aria-label` when expanded: `Collapse sidebar`
- `aria-label` when collapsed: `Expand sidebar`
- Visible glyph: CSS-driven — `◀` (expanded, "collapse") / `▶` (collapsed, "expand"). No text label.

## Notes for the build
- The icon + label are separate elements per nav item; collapsed → the label is **visually hidden** (e.g. an `.sr-only`/clip technique), NOT removed (keeps the screen-reader accessible name).
- `localStorage` key: `sidebar-collapsed` (`1` = collapsed, absent/`0` = expanded).
- No new visible strings beyond the toggle aria-labels + the three added icons.
