# CB-5.1 — Design (decision-trace log view)

_Designer artifact. Reuses the CB-5.0 dashboard shell + `LiveModeBanner` + inline-styles convention. Desktop-first; no new dependency._

## Surface: `/dashboard/trace`

```
┌──────────────────────────────────────────────────────────┐
│  crypto-bot                                  [ Sign Out ]  │   ← chrome (reused)
├──────────────────────────────────────────────────────────┤
│  ▟▟▟  DRY RUN — paper trading. … ▟▟▟                      │   ← LiveModeBanner (reused)
├──────────────────────────────────────────────────────────┤
│  Decision trace                          ← Back to dashboard│
│                                                            │
│  2026-06-14 17:15 UTC   ·   hold                           │   ← tick header (newest first)
│     BTC-USD   hold   rsi 58.58  ma 64103.95                │
│       hold: rsi=58.58 >= entry_threshold=30 …             │   ← reason (verbatim)
│     ETH-USD   hold   rsi 53.41  ma 1677.67                 │
│       hold: position open + rsi=53.41 <= exit_threshold=70 │
│     …                                                      │
│  ────────────────────────────────────────────────────────│
│  2026-06-14 17:00 UTC   ·   buy                            │
│     BTC-USD   buy    rsi 27.30  ma 42010.00                │
│       buy: rsi=27.30 < entry_threshold=30; buy $50 BTC-USD │
│     …                                                      │
│  ────────────────────────────────────────────────────────│
│  2026-06-14 16:45 UTC   ·   hold   ⚠ error                 │   ← error tick (AC 3)
│       tick_error: <sanitized detail>                      │
│                                                            │
│  Showing the 50 most recent ticks. Older ticks not shown.  │   ← bounded note (AC 7)
└──────────────────────────────────────────────────────────┘
```

## Structure + hierarchy
- **Page heading** `Decision trace` (left) + `← Back to dashboard` link (right), same rhythm as CB-5.0 section headings.
- **Per tick**: a header line — `{tick_started_at} UTC · {aggregate decision}` (decision in a subtle weight/color; buy green-ish, sell amber-ish, hold neutral — but ALWAYS with the text label, never color-only). A thin divider between ticks.
- **Per-asset signal rows** indented under the tick: `{asset} {decision} rsi {x} ma {y}` on one line, the **reason string verbatim** on the next (muted, smaller). Null rsi/ma render as `—` (AC 4).
- **Error tick** (AC 3): a `⚠ error` marker on the tick header + the sanitized `error_detail` in place of signal rows; muted-red text (`#b71c1c`), text-labeled.
- **Empty state** (AC 6): `No decisions logged yet.` muted, centered-ish.
- **Bounded note** (AC 7): when `limit` ticks are shown and more exist, a muted footer line.

## Accessibility
- Semantic structure: a list of ticks; each tick a section with a heading; signal rows in a definition-list or table-like layout with text labels. Decision color is reinforced by the text label (never color alone). Reason text is plain language (CB-4.1). Contrast ≥ WCAG AA on all text.

## Out of scope (design)
- Per-tick dry-run/live badge (PM Decision #2 — banner gives mode context; per-execution status is CB-5.2's ledger).
- Filtering/search, pagination UI (deferred), charts. CB-5.2 ledger is a separate surface.
