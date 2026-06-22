# CB-6.3 — Design (Signals + Next Action card)

_Designer artifact. Layout reference: `ETH_USD Bot — Coinbase.pdf` (the SIGNALS / NEXT ACTION block). Builds cockpit **section 4 (Signals + Next Action)** for the viewed pair (CB-6.1's selector). Inline styles per CB-5/CB-6.x; decision colors reuse the CB-5.1 decision-trace palette. SSR per load._

## Section 4 — Signals + Next Action (per the PDF)

```
│  SIGNALS                                                  │
│   RSI ZONE            42.1  ·  Neutral                    │
│   PRICE vs MA20       $1,792.39  >  $1,740.10  ·  Above   │
│                                                           │
│   NEXT ACTION   ▸ HOLD                                    │
│     hold: rsi=42.10 < entry_threshold=30 BUT price ...    │
```

- **RSI ZONE row:** `RSI ZONE` + the latest `rsi` (1 dp) + a zone word — **Oversold / Neutral / Overbought** — derived from the **strategy's own RSI thresholds** (not generic 30/70):
  - `Oversold` when `rsi ≤ entry_rules.rsiThreshold` (a buy candidate by the bot's own rule).
  - `Overbought` when `rsi ≥ exit_rules.rsiThreshold` (a sell candidate).
  - `Neutral` otherwise.
  - Tying the zone to the strategy's thresholds keeps the card honest to what actually drives the bot (vs. a textbook 30/70 the bot may not use).
- **PRICE vs MA{period} row:** `PRICE vs MA<maPeriod>` (the **single** MA the strategy uses — `entry_rules.maPeriod`; resolved decision below) + `lastClose` vs `ma` with a relation glyph + a word — **Above / Below / At**:
  - `Above` when `lastClose > ma`; `Below` when `lastClose < ma`; `At` when equal.
- **NEXT ACTION block:** `NEXT ACTION` + a badge derived from the bot's latest **persisted** decision for the pair (colored, reusing CB-5.1 trace: buy `#1b5e20`, sell `#8a6d00`, hold `#444`). "Next action" = what the bot would do on its next evaluation given the current signals (deterministic/reactive — the latest decision IS the next action until signals change).
  - **AMENDED 2026-06-22** (dust phantom-sell fix; operator-approved): the badge is **BUY / SELL / HOLDING / WAITING TO BUY** (was BUY/SELL/HOLD). A `hold` for an **open** position → `HOLDING` (reason verbatim); a `hold` while **flat** (no position / dust / no buy signal) → `WAITING TO BUY` with `Enters when RSI < <entry> (currently <rsi>, <zone>)`. Derived **DB-only** from the persisted decision + reason (engine's `isOpenPositionHold`) — never a Coinbase re-read, so a transient account-fetch failure can't rewrite the displayed action (preserves CB-6.3's DB-only contract). BUY/SELL render the reason verbatim; the raw reason is always in `/dashboard/trace`.

## Single MA (resolved 2026-06-16, operator)
The PDF shows two MA rows (MA20 + MA50), but the bot **persists exactly one** moving average per signal — the strategy's configured `entry_rules.maPeriod`. CB-6.3 shows that **one real MA** (`PRICE vs MA<maPeriod>`), labeled with its actual period. Showing a second MA the bot doesn't use would mean fetching candles + recomputing strategy-adjacent math in the view and displaying a number that doesn't influence decisions — rejected (brief: "displays what the bot produces; no strategy change"). A future two-MA display would require a strategy change (out of scope).

## Not session-gated (deliberate — differs from CB-6.2)
Unlike Profit/Loss (CB-6.2, gated on an active session), the Signals card renders the **latest available signal** for the viewed pair regardless of run state. The last evaluation is "what the bot last saw / would do" and stays meaningful when the bot is paused or stopped. The card is pair-scoped (it renders whenever a signal exists for the viewed pair), not session-scoped.

## States (don't blank the cockpit)
- **Latest signal present** → full card (RSI zone + price-vs-MA + next action + reason).
- **No signal yet for the pair** (bot never evaluated it) → `No signals yet — the bot hasn't evaluated this pair yet.` (no rows).
- **RSI null** (insufficient bars) → RSI ZONE shows `—` (no zone word).
- **MA null** (insufficient bars) → PRICE vs MA row shows `—` (no relation word). The MA-period label still reflects the strategy.
- **Decision/reason always present** when a signal row exists (`decision` + `reason` are NOT NULL in the schema) → NEXT ACTION + reason always render for an existing signal.

## Accessibility
- Zone + relation are **words** (Oversold/Above/HOLD), not color-only; the decision badge color reinforces the word (matches CB-5.1 trace + CB-6.2 signed P&L approach).
- The reason string is rendered verbatim as text.

## Out of scope (design)
- Trade Log (CB-6.4); Run-now (CB-6.5); real-money overrides (CB-6.6). A second/derived MA (see decision). No new strategy or signal math — display only.
