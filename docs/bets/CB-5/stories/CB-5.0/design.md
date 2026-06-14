# CB-5.0 — Design (live-state view + LIVE_MODE banner)

_Designer artifact. Layout + visual hierarchy for the live-state surface on `/dashboard`. Inline-styles convention (no Tailwind/shadcn — consistent with CB-1.6 / CB-3.3). Single-operator desktop-first; no responsive breakpoints required for MVP (operator self-monitors on a laptop)._

## Surface: `/dashboard` (live-state home)

Replaces the CB-1.6 placeholder. Page structure top → bottom:

```
┌──────────────────────────────────────────────────────────┐
│  crypto-bot                                  [ Sign Out ]  │   ← existing chrome (CB-1.6)
├──────────────────────────────────────────────────────────┤
│  ▟▟▟  DRY RUN — paper trading. No real orders. ▟▟▟        │   ← LIVE_MODE banner (AC 3)
├──────────────────────────────────────────────────────────┤
│  Bot status                                                │
│    ● Active   ·   session started 2026-06-12 21:45 UTC     │   ← session panel
│                                                            │
│  Holdings  (from your Coinbase fills)                      │
│    BTC-USD    0.0123 BTC   ·   avg cost $42,010.00         │   ← holdings panel (per asset)
│    ETH-USD    no position                                  │
│    …                                                       │
│                                                            │
│  This session                                              │
│    3 bot buys   ·   $150.00 invested   (paper)             │   ← activity panel (mode-labeled)
│                                                            │
│  ↳ Create or revise your DCA strategy                      │   ← existing strategy link
│  Connected device: …                                      │   ← existing device line
└──────────────────────────────────────────────────────────┘
```

## LIVE_MODE banner (AC 3 — shared component, reused by CB-5.1/5.2/5.3)

The single most important visual element: the operator must NEVER be unsure whether real money is in play.

| State | Background | Text/border | Label (copy.md) | Icon/marker |
|---|---|---|---|---|
| `LIVE_MODE=false` (dry run) | calm neutral `#eef2f7` | `#33415c` text, `#c3cfe0` border | "DRY RUN — paper trading…" | ▟ neutral |
| `LIVE_MODE=true` (live) | high-alert `#fdecea` | `#b71c1c` text, `#f44336` border | "● LIVE — real orders…" | ● red dot |

- **Full-bleed** across the content column, directly under the chrome, above all panels — first thing the eye hits.
- **Text-labeled, never color-only** (accessibility): the words "DRY RUN" / "LIVE" carry the meaning; color reinforces. WCAG AA contrast on both palettes (dark text on light bg, ratios ≥ 4.5:1).
- `role="status"` (dry) / `role="alert"` (live) so assistive tech announces the live state.

## Panels (visual hierarchy)

- **Section headings** (`Bot status`, `Holdings`, `This session`): `1rem`, weight 600, `#222`, ~`1.5rem` top margin — consistent with the strategy page's heading rhythm.
- **Bot status**: a small status dot (● green = active, ⏸ grey = paused, ↺ grey = reset) + the text label, then `· session started <ts>`. Dot is paired with text (not color-only).
- **Holdings**: a simple two-column list per asset — `<asset-id>` left, `<qty> <base> · avg cost $<x>` right. "no position" in muted `#888` for assets the operator doesn't hold. A muted caption "(from your Coinbase fills)" sets the source expectation (data-honesty per Risk).
- **This session**: `<n> bot buys · $<x> invested` with a mode tag `(paper)` while `LIVE_MODE=false` / `(live)` when true — reinforces the banner at the data level.
- **Degraded holdings** (Coinbase fetch failed, AC 4): the Holdings panel shows the unavailable-state copy in muted text; status + activity panels render normally.

## Empty states (AC 5)
- **No active session**: replace the three panels with a single calm message + the strategy-authoring link (copy.md).
- **Zero holdings / zero activity**: the respective panel shows its empty-state line (copy.md), other panels render normally.

## Out of scope (design)
- Current price / live position value (avg cost only for MVP).
- Charts/sparklines, responsive/mobile layout, theming — post-MVP.
- Decision-trace + ledger tables (CB-5.1 / CB-5.2 design).
