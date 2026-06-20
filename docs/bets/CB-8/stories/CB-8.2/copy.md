# CB-8.2 — Copy (verbatim)

_UX Writer artifact. VERBATIM (refusal rule #5). Adds the mobile hamburger + drawer close control. The nav items + their icons are unchanged from CB-8.0/8.1 (the drawer reuses the existing sidebar content)._

## Mobile top bar
- App title: `crypto-bot` (existing string — reused, not new).
- Hamburger control: no visible text; glyph `☰` (CSS or text), `aria-label`: `Open menu`.

## Drawer close control
- Close button: no visible text; glyph `✕` (CSS or text), `aria-label`: `Close menu`.

## Hamburger state (a11y)
- `aria-expanded`: `false` (closed) / `true` (open).
- `aria-label` is constant (`Open menu`) — `aria-expanded` carries the open/closed state. (Do not flip the label to "Close menu" on the hamburger; the in-drawer ✕ is the close affordance.)

## Nav items (unchanged — reused in the drawer)
- `🤖` · `Crypto` → `/dashboard`
- `📈` · `Equity` → `/dashboard/equity`
- `📊` · `Mutual Funds` → `/dashboard/mutual-funds`
- `⚙️` · `Strategy` → `/dashboard/strategy`
- `🧭` · `Decision trace` → `/dashboard/trace`
- `📒` · `Ledger` → `/dashboard/ledger`

## Notes for the build
- **No new visible strings.** The only additions are two `aria-label`s (`Open menu`, `Close menu`) + two glyphs (`☰`, `✕`). The app title `crypto-bot` already exists (CB-8.0).
- No error / empty / success copy — this is static navigation chrome (no async data, no actions). Sign out in the drawer footer keeps its existing copy + behavior (unchanged).
