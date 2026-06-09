---
id: CB-3.3-COPY
bet: CB-3
story: CB-3.3
type: copy
status: ready
author: UX Writer (Compass role; Claude per tool assignment)
created: 2026-06-08
---

# CB-3.3 Copy — Strategy authoring form

**Every string below is verbatim. Engineer MUST NOT paraphrase.** Per [`compass/roles/engineer.md`](../../../../../compass/roles/engineer.md) Forbidden: "Paraphrasing UX Writer's copy."

**Voice**: operator-friendly. No trading jargon left unexplained. Plain noun verbs ("Save strategy", not "Persist configuration"). Honest about what the bot will and won't do.

## Page-level

| Slot | First-time (empty state) | Revising (existing active) |
|---|---|---|
| **Browser title** | `Create your strategy · DCA bot` | `Revise your strategy · DCA bot` |
| **H1** | `Create your strategy` | `Revise your strategy` |
| **Revision banner** (only when revising) | — | `You're revising the active strategy. Saving creates a new version; the current one is archived but stays queryable in the dashboard.` |
| **Back link** (header) | `← Back to dashboard` | (same) |

## Form sections

### Name

| Slot | String |
|---|---|
| **Label** | `Name` |
| **Placeholder** | `My DCA strategy` |
| **Helper text** | `A short name you'll see in the dashboard.` |

### Assets

| Slot | String |
|---|---|
| **Section title** | `Assets` |
| **Selector header** (dynamic — replace `YYYY-MM-DD HH:mm` with the fetch timestamp) | `Selected from top-5 by dollar volume (as of YYYY-MM-DD HH:mm)` |
| **Add button** | `+ Add another` |
| **Add affordance — search placeholder** | `Search USD-quoted spot products…` |
| **Add affordance — empty result** | `No products match your search.` |
| **Remove chip — SR label** (per chip; substitute `BTC-USD` with the actual identifier) | `Remove BTC-USD` |
| **Helper text** | `1-5 cryptos. The bot considers ONLY these.` |
| **Add disabled (5 selected)** | `Maximum 5 reached. Remove one to add another.` |

### Entry rules

| Slot | String |
|---|---|
| **Section title** | `Entry rules` |
| **Description** | `Buy when:` |
| **RSI threshold — label** | `RSI threshold` |
| **RSI threshold — helper** | `Between 0 and 100. Lower means the bot waits for deeper dips.` |
| **MA period — label** | `MA period` |
| **MA period — helper** | `Days the moving average looks back over.` |
| **MA reinforcement — checkbox label** | `Also require price < MA(period)` |
| **MA reinforcement — helper** | `Optional. When on, the bot only buys if the price is below its moving average — extra confirmation.` |

### Exit rules

| Slot | String |
|---|---|
| **Section title** | `Exit rules` |
| **Description** | `Sell when:` |
| **RSI threshold — label** | `RSI threshold` |
| **RSI threshold — helper** | `Between 0 and 100. Must be greater than the entry RSI.` |
| **Min profit % — label** | `Min profit %` |
| **Min profit % — helper** | `The bot only sells if the position is at least this much in profit.` |
| **Sell fraction — label** | `Sell fraction` |
| **Sell fraction — helper** | `0 to 1. For example, 0.5 sells half the position; 1 sells all of it.` |

### Per-buy + per-session limits

| Slot | String |
|---|---|
| **Section title** | `Per-buy + per-session limits` |
| **Position size — label** | `Position size (USD)` |
| **Position size — helper** | `How much to spend per buy signal.` |
| **Per-session buy count — label** | `Per-session buy count` |
| **Per-session buy count — helper** | `Maximum number of buys the bot will fire in one trading session.` |
| **Per-session dollar cap — label** | `Per-session dollar cap` |
| **Per-session dollar cap — helper** | `Maximum total spend in one trading session.` |

## Buttons

| Slot | First-time | Revising |
|---|---|---|
| **Primary (submit)** | `Save strategy` | `Save revision` |
| **Primary (in flight)** | `Saving…` | `Saving…` |
| **Secondary (cancel)** | `Cancel` | `Cancel` |

## Destructive confirmation modal (revise only)

| Slot | String |
|---|---|
| **Title** | `Revise strategy?` |
| **Body** | `The current version will be archived but kept queryable for the dashboard.` |
| **Confirm button** | `Continue` |
| **Cancel button** | `Cancel` |

## Inline field errors (mapped from `VALIDATION_ERROR_CODES`)

Each error code from `lib/strategy-core/validate.ts` maps to a verbatim string rendered below the affected input.

| Error code | String |
|---|---|
| `ENTRY_RSI_OUT_OF_RANGE` | `Must be between 0 and 100.` |
| `EXIT_RSI_OUT_OF_RANGE` | `Must be between 0 and 100.` |
| `MA_PERIOD_INVALID` | `Must be 5, 10, 20, or 50.` |
| `ENTRY_RSI_NOT_LESS_THAN_EXIT_RSI` | `Entry RSI must be less than exit RSI — otherwise the bot would buy and sell at the same level.` |
| `POSITION_SIZE_USD_NOT_POSITIVE` | `Must be greater than 0.` |
| `PER_SESSION_BUY_COUNT_CAP_NOT_POSITIVE` | `Must be a positive whole number.` |
| `PER_SESSION_DOLLAR_CAP_NOT_POSITIVE` | `Must be greater than 0.` |
| `SELECTED_ASSETS_COUNT_OUT_OF_RANGE` | `Pick between 1 and 5 cryptos.` |
| `SHAPE_INVALID` | `Something's wrong with this field. Check the value and try again.` |

## Top-of-form error banner (discriminated)

| Error type | String |
|---|---|
| **validation** | `Some fields need attention. See errors above.` |
| **network** | `Save failed. Check your connection.` |
| **server** | `Save failed on the server. Try again.` |
| **unknown** | `Unexpected error. Try again or reload.` |

## Top-of-form fallback notices

| Condition | String |
|---|---|
| **Top-5 fetch timed out (10s)** | `Couldn't load top-5 — please try again later.` |
| **Top-5 fetch errored (not timeout)** | `Couldn't load top-5 from Coinbase. Try reloading.` |

## Success toast (renders on /dashboard after redirect)

| Slot | String |
|---|---|
| **Body** | `Strategy saved. Bot will pick it up on the next tick.` |

## Unsaved-changes prompts

| Trigger | String |
|---|---|
| **Cancel button while form is dirty** | `Discard unsaved changes?` (via `window.confirm`) |
| **Browser back / close tab while form is dirty** (`beforeunload` event) | Browser-default message (modern browsers ignore custom strings for `beforeunload`; that's fine — the OS-native dialog still surfaces) |

## Things this copy intentionally does NOT include

- "Backtesting" / "historical performance" copy — out of MVP per portfolio
- "AI-recommended" / "smart suggestions" copy — explicitly OUT per product.md DRI Decision
- "Switch to live mode" copy — that's CB-4 / CB-5 scope; this form persists the strategy regardless of LIVE_MODE
- "Compare to last 7 days top-5" copy — deferred per brief PM Risk #4 (Top-5 churn surprise); CB-5's dashboard may add it later
- Translations / i18n — single-operator; US-English only
