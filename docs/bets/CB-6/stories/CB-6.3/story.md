---
id: CB-6.3
bet: CB-6
type: story
status: shipped
priority: P1
created: 2026-06-16
author: PM
design_link: docs/bets/CB-6/stories/CB-6.3/design.md
copy_link: docs/bets/CB-6/stories/CB-6.3/copy.md
area_tags: [frontend, dashboard, multi-asset, cockpit, signals]
dependencies:
  - CB-6.1 shipped (per-pair selector + Current Position; loadCockpitPosition latest-signal query to mirror)
  - CB-5.1 decision-trace read model + signals table (rsi/ma/ma_period/last_close/decision/reason) — reused
e2e: true
---

# CB-6.3 — Cockpit Signals + Next Action card (FOURTH CB-6 STORY)

## Description

Fills cockpit **section 4 (Signals + Next Action)** for the viewed pair: the latest signal's **RSI Zone**, **Price vs MA<period>**, and the bot's **Next Action** (decision + reason verbatim). Pure recomposition of CB-5.1's shipped `signals` data — **DB-only read, no Coinbase, no new backend, no migration, no new strategy or signal math** (CB-6 displays what the bot produces). Mirrors CB-6.1's latest-signal query.

## Acceptance Criteria

- [ ] **AC 1 — Signals card (section 4).** For the viewed pair: `RSI ZONE` (rsi 1 dp + zone word) · `PRICE vs MA<period>` (lastClose vs ma + relation word) · `NEXT ACTION` (decision badge + the `reason` string verbatim). Copy + labels verbatim ([copy.md](copy.md)).
- [ ] **AC 2 — Read fn** `lib/dashboard/cockpit-signals.ts` `loadCockpitSignals(pair)` → the pair's latest signal `{ rsi, ma, maPeriod, lastClose, decision, reason }` or **null** when the pair has no signal yet. Resolves "latest" by mirroring `cockpit-position.ts`: `signals s JOIN bot_ticks t ON t.id = s.tick_id WHERE s.asset_identifier = $pair ORDER BY t.tick_started_at DESC LIMIT 1`. **DB-only** (no Coinbase read) → no scoped try/catch needed (the PR #73 trap doesn't apply here).
- [ ] **AC 3 — Strategy-relative derivations (display only).** RSI zone from the **strategy's own thresholds**, not generic 30/70: `Oversold` = `rsi ≤ entry_rules.rsiThreshold`; `Overbought` = `rsi ≥ exit_rules.rsiThreshold`; else `Neutral`. Price-vs-MA: `Above`/`Below`/`At` (`lastClose` vs `ma`). Next Action = the bot's most recent `decision` (BUY/SELL/HOLD) + `reason` rendered verbatim (never paraphrased — refusal rule #5).
- [ ] **AC 4 — Single MA (resolved 2026-06-16, operator).** Show only the **one** MA the bot uses — `entry_rules.maPeriod` (label) with the signal's `ma` (value). NO candle fetch, NO second/derived MA (the PDF's MA20+MA50 would need a strategy change — out of scope). Label reflects the strategy's `maPeriod`; value is the signal's `ma`.
- [ ] **AC 5 — Not session-gated (deliberate — differs from CB-6.2).** The card renders the **latest available signal** for the viewed pair regardless of run state (active/paused/stopped) — the last evaluation stays meaningful when paused. Pair-scoped, NOT session-scoped. No signal yet → `No signals yet — the bot hasn't evaluated this pair yet.`; rsi null → `—` (no zone word); ma null → `—` (no relation word; MA-period label still shows). Copy verbatim.
- [ ] **AC 6 — Read-only invariant holds.** `cockpit-signals.ts` is a single SELECT; imports no mutating helpers; never reaches `lib/coinbase/orders` (in fact reaches no Coinbase at all). The dashboard read-only invariant test stays green.
- [ ] **AC 7 — No regression.** Bot Status (6.0) / Current Position (6.1) / Profit-Loss (6.2) / CB-5 surfaces unchanged; `/dashboard` stays dynamic (`ƒ`). The Signals `<CockpitSection label="SIGNALS" />` placeholder is replaced by the real card.
- [ ] **AC 8 — Tests.** Unit `loadCockpitSignals`: happy (full row); no signal for pair → null; rsi null; ma null. Component card render: zone word flips at the **strategy's** entry/exit thresholds (not 30/70); Above/Below; decision badge + reason verbatim; "No signals yet"; rsi/ma "—". (Render tests: single-string template literals to avoid the CB-6.1 split-text-node trap.) e2e (Codex): a seeded signal shows zone + price-vs-MA + next action; an unevaluated pair shows "No signals yet".
- [ ] **AC 9 — Gates.** typecheck / lint / test / build clean; e2e via the test DB.

## Standard Experience Checklist

UI story — load-bearing.
- [ ] **Navigation** — `n/a — the pair selector (navigation) shipped in CB-6.1; this story adds a read-only card.`
- [ ] **States** — `covered by AC 1/5: signal present (zone + price-vs-MA + next action); no signal yet; rsi null; ma null.`
- [ ] **Feedback** — `covered by AC 1/3: zone word + decision badge + verbatim reason communicate the bot's read; no actions (read-only).`
- [ ] **Accessibility** — `covered by AC 3: zone/relation/decision are words (Oversold/Above/HOLD); color reinforces, never the sole signal (matches CB-5.1 trace + CB-6.2).`
- [ ] **Edge cases** — `covered by AC 5: pair never evaluated → "No signals yet"; insufficient bars → rsi/ma "—"; bot paused/stopped → the latest signal still renders (not session-gated).`
- [ ] **Cross-surface consistency** — `covered by AC 3: zone uses the strategy's actual RSI thresholds + the reason verbatim, so the cockpit never contradicts the /dashboard/trace view.`

## Tech notes

### Reuse (DB-only — no new backend, no migration, no Coinbase)
- `lib/dashboard/cockpit-position.ts` — the **latest-signal query pattern to mirror** (`signals ⋈ bot_ticks … ORDER BY tick_started_at DESC LIMIT 1`); it already pulls `rsi` for the pair.
- `lib/dashboard/decision-trace.ts` — `SignalRow` shape + the `Decision` type (`"buy" | "sell" | "hold"`).
- `app/dashboard/trace/page.tsx` — decision colors to match (buy `#1b5e20`, sell `#8a6d00`, hold `#444`).
- `lib/strategies/db.ts:getActiveStrategy()` — already loaded at the page level; provides `entry_rules.rsiThreshold` / `exit_rules.rsiThreshold` / `entry_rules.maPeriod` for the zone + MA label. Pass to the card; do NOT re-read.
- `app/dashboard/cockpit-section.tsx` scaffold; `current-position-card.tsx` / `profit-loss-card.tsx` styling for consistency.

### Engineer DRI (confirm at build)
- `loadCockpitSignals(pair)` returns `null` when the pair has no signal row; the page renders the card only when non-null, else the "No signals yet" treatment.
- The card is **presentational**: it receives the signal + the strategy's RSI thresholds (+ uses `strategy.entry_rules.maPeriod` for the MA label, the signal's `ma` for the value). Pure derivation helpers (zone, relation) — no I/O.
- DB-only read → no scoped try/catch (no Coinbase failure mode here, unlike CB-6.1/6.2).

### What this story does NOT include
- Trade Log (CB-6.4); Run-now (CB-6.5); real-money overrides (CB-6.6). A second/derived MA (resolved: single real MA). Any new strategy or signal computation — display only.

## PRs
_Auto-populated._

## Tests
_Unit/component co-located; e2e by Codex in `e2e/dashboard/` (test DB; issue #80 may gate local e2e)._

## DRI Log

### Decisions
- [2026-06-16] [Operator/PM] **Single real MA (`entry_rules.maPeriod`), not the PDF's MA20+MA50.** The bot persists exactly one MA per signal (the strategy's). Showing it honestly beats fetching candles to compute a second MA the bot never uses (would add a Coinbase dependency, recompute strategy math in the view, and display a non-decision number on a transparency surface). — area: scope/ux — alternatives: compute MA20+MA50 for PDF parity (rejected) — reversibility: medium (a future two-MA display needs a strategy change).
- [2026-06-16] [PM] **RSI zone is strategy-relative** (`Oversold` = `rsi ≤ entry_rules.rsiThreshold`; `Overbought` = `rsi ≥ exit_rules.rsiThreshold`; else `Neutral`) — not hardcoded 30/70 — so the cockpit reflects what actually drives the bot and never contradicts the trace. — area: correctness — reversibility: easy.
- [2026-06-16] [PM] **Next Action = the bot's most recent decision + reason verbatim** (the deterministic next move given current signals; the bot is reactive). No new prediction logic. — area: scope — reversibility: easy.
- [2026-06-16] [PM] **Signals are NOT session-gated** (differs from CB-6.2 Profit/Loss). The latest signal is the last evaluation — meaningful when the bot is paused/stopped — so it renders whenever a signal exists for the viewed pair, pair-scoped not session-scoped. — area: ux — alternatives: session-gate like 6.2 (rejected — signals aren't a per-run figure; gating would blank a useful panel when paused) — reversibility: easy. **(Preempts the CB-6.2 BLOCKER-1-style gating question: here, ungated is intentional and documented.)**
- [2026-06-16] [Engineer] **New `loadCockpitSignals(pair)` mirrors the cockpit-position latest-signal SELECT; DB-only** (no Coinbase → no scoped try/catch); returns null when no signal. Strategy thresholds + MA period come from the page's existing `getActiveStrategy()` (no duplicate read). — area: read-model — reversibility: easy.
- [2026-06-16] [Engineer] **Built (confirms the above).** `loadCockpitSignals` returns `CockpitSignal | null` (latest `signals⋈bot_ticks` for the pair; numeric cols `::float8`-cast for safe numbers, matching CB-6.2). `SignalsCard` is presentational: receives the signal + `entry_rules.rsiThreshold` / `exit_rules.rsiThreshold` / `entry_rules.maPeriod` from the page; pure `rsiZone`/`priceVsMa` helpers; the **MA-period LABEL uses the strategy's `maPeriod` prop** (the value is the signal's `ma`) per AC 4. Cell text built as single strings (split-text-node mitigation). Page renders the card only when `cockpitSignals && strategy`, else the "No signals yet" treatment (CockpitSection) — both keep the "View decision trace →" link. Gates: typecheck/lint clean; 832 tests pass; `/dashboard` stays `ƒ` Dynamic; read-only invariant green. — area: ui/read-model — reversibility: easy.

### Risks
- [2026-06-16] [Engineer] **Render-test split-text trap** (the CB-6.1 lesson) — zone/relation/value rendered as adjacent JSX text nodes aren't contiguous in `JSON.stringify`, so naive `toContain` assertions miss them — likelihood: medium — impact: low (test-only) — mitigation: assert against single-string template literals — area: testing.
- [2026-06-16] [Engineer] **Zone divergence from the trace** if the card hardcodes 30/70 instead of the strategy thresholds — likelihood: low — impact: medium (contradicts the bot's actual rule on a transparency surface) — mitigation: AC 3 + copy note mandate strategy thresholds; a unit test asserts the zone flips at the strategy's threshold — area: correctness.
- [2026-06-16] [PM] **"Next Action" read as a hard forward prediction** — likelihood: low — impact: low — mitigation: it IS the deterministic next move given current signals; the verbatim reason explains it; no extra copy — area: ux.

### Issues
_None at story creation._

---
_Story closed: 2026-06-16 (SHIPPED via PR #92 + Codex e2e), brief: docs/bets/CB-6/brief.md. **FOURTH CB-6 STORY — Signals + Next Action; DB-only recomposition of CB-5.1.**_
