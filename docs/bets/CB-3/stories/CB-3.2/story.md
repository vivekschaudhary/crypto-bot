---
id: CB-3.2
bet: CB-3
type: story
status: ready
priority: P0
created: 2026-06-08
author: PM
design_link: n/a — pure DB migration; no UI surface
area_tags: [strategy, db, migration, schema, data-model]
dependencies:
  - CB-3 brief approved 2026-06-08
  - CB-3 architecture artifact approved 2026-06-08
  - CB-3.0 shipped 2026-06-08 (provides Zod types reused for DB-row roundtrip tests)
  - bot_sessions table already exists in 0001-init.sql:23-30 (architecture Issue #1 RESOLVED — CB-3.2 only adds FK column, NOT the table itself)
estimate:
  effort: small
  confidence: high
e2e: false
---

# CB-3.2 — `strategies` DB schema + migration (`0004-strategies.sql`)

## Description

Ship the DB substrate that materializes CB-3.0's Zod types into a queryable Postgres table. Per [bet architecture Decision #4](../../architecture.md#4-strategies-db-schema-overrides-foundations-strategies-placeholder-mention): a new migration `0004-strategies.sql` creates the `strategies` table with the exact column shapes the architecture documents (ULID `text` PK; `asset_class` discriminator; `selected_assets` jsonb; `entry_rules` + `exit_rules` jsonb; `position_size_usd` + per-session caps with `CHECK` constraints; `created_at` timestamptz default; FK to `auth_users(id)`; self-FK `superseded_by_strategy_id` for append-only versioning). The migration also adds `bot_sessions.active_strategy_id` as a nullable FK to `strategies(id)`.

After this story ships:

- CB-3.3 (form UI + save action) can `INSERT` strategy rows + `UPDATE bot_sessions.active_strategy_id` to wire activation
- CB-3.4 (activation wiring) — if not folded into .3 — can flip the active strategy without schema changes
- CB-4 (bot runtime, separate bet) reads strategy rows via the active_strategy_id FK on every cron tick

Server-only. No UI. No live Coinbase calls. No app-code DB writes ship in this story — only the DDL + a co-located TypeScript module-load test that exercises CB-3.0's Zod schemas against fixture rows shaped exactly like the new DB columns. `e2e: false`.

**Architecture Issue #1 (open at story creation time) RESOLVED at this story's drafting:** `bot_sessions` table already exists in [`db/migrations/0001-init.sql:23`](../../../../../db/migrations/0001-init.sql) (created at v1 foundation scaffold). CB-3.2 ships ONLY the `strategies` table + the FK column on the existing `bot_sessions` table. NOT a second creation of `bot_sessions`.

## Acceptance Criteria

- [ ] **AC 1** — `db/migrations/0004-strategies.sql` exists and contains the `strategies` table DDL **verbatim from [bet architecture Decision #4](../../architecture.md#4-strategies-db-schema-overrides-foundations-strategies-placeholder-mention)**:
  - `id text PRIMARY KEY` (ULID stored as text per foundation arch § Identity strategy)
  - `name text NOT NULL`
  - `asset_class text NOT NULL` (discriminator: `'crypto-coinbase' | 'equity-broker' | ...`; matches CB-3.0 `AssetClassSchema`)
  - `selected_assets jsonb NOT NULL` (array of `{assetClass, identifier}`; validated app-layer via CB-3.0's `StrategySchema`)
  - `entry_rules jsonb NOT NULL` (Zod-validated by CB-3.0 `EntryRulesSchema`)
  - `exit_rules jsonb NOT NULL` (Zod-validated by CB-3.0 `ExitRulesSchema`)
  - `position_size_usd numeric NOT NULL CHECK (position_size_usd > 0)`
  - `per_session_buy_count_cap integer NOT NULL CHECK (per_session_buy_count_cap > 0)`
  - `per_session_dollar_cap numeric NOT NULL CHECK (per_session_dollar_cap > 0)`
  - `created_at timestamptz NOT NULL DEFAULT now()`
  - `created_by_user_id text NOT NULL REFERENCES auth_users(id)`
  - `superseded_by_strategy_id text REFERENCES strategies(id)` (nullable self-FK)
- [ ] **AC 2** — Same migration ALTERs `bot_sessions` to add `active_strategy_id text REFERENCES strategies(id)` (nullable; defaults to NULL). The `bot_sessions` table already exists in `0001-init.sql:23-30` (architecture Issue #1 RESOLVED — see Description). Migration MUST NOT recreate `bot_sessions`; use `ALTER TABLE bot_sessions ADD COLUMN`.
- [ ] **AC 3** — Migration runs idempotently in the migrate-runner's transaction wrapper per [`lib/db/migrate.ts:90-98`](../../../../../lib/db/migrate.ts). DDL is plain SQL (no migration-runner-specific syntax). If re-applied accidentally, the runner's `_migrations` table prevents re-execution — but the migration itself must NOT silently succeed if a prior version of the table exists with a different shape. Use bare `CREATE TABLE strategies` (NOT `CREATE TABLE IF NOT EXISTS`) so any shape divergence fails loud, mirroring `0001-init.sql`'s pattern.
- [ ] **AC 4** — `db/schema.sql` (canonical reference per the file's top-of-file comment + `0001-init.sql:2`) is updated to mirror the new migration. Add the `strategies` `CREATE TABLE IF NOT EXISTS` block + the `bot_sessions.active_strategy_id` column to the existing `bot_sessions` definition. Index additions (if any per AC 8) mirrored too. Order matches the section comments in the existing file (product entities together).
- [ ] **AC 5** — DB-Zod-roundtrip test at `tests/lib/strategy-core/db-roundtrip.test.ts` (~6 tests) constructs fixture rows shaped exactly like the planned `strategies` table columns (snake_case top-level + camelCase inner jsonb shapes — matching CB-3.0 `types.ts` convention split documented at [types.ts:13-28](../../../../../lib/strategy-core/types.ts)), feeds them through `StrategySchema.parse()`, and asserts roundtrip equality. This is the CB-3.0-types-reuse proof — CB-3.2 ships NO new TypeScript types; the DB row shape IS CB-3.0's `Strategy` type. Tests:
  - Valid full row roundtrips cleanly (Date in → ISO string out → coerced back to Date)
  - Row with `superseded_by_strategy_id: null` roundtrips
  - Row with `superseded_by_strategy_id: <ulid>` roundtrips (supersession case)
  - Row with `selected_assets: []` REJECTED by Zod (CB-3.0 min(1) validation)
  - Row with `selected_assets` > 5 items REJECTED by Zod (CB-3.0 max(5))
  - Row with `position_size_usd: 0` REJECTED by Zod (matches DB CHECK constraint)
- [ ] **AC 6** — DB CHECK constraint vs Zod validation alignment test at `tests/db/migration-0004-constraint-alignment.test.ts` (~4 tests). Reads `0004-strategies.sql` as a text file + asserts the documented CHECK constraints (`position_size_usd > 0`; `per_session_buy_count_cap > 0`; `per_session_dollar_cap > 0`) each have a corresponding Zod constraint in `lib/strategy-core/validate.ts`. **This closes the "DB CHECK vs Zod duplication" risk** flagged in [bet architecture Risks](../../architecture.md#risks). The test is plain-text regex assertion against the migration file + grep against validate.ts; no Postgres connection required.
- [ ] **AC 7** — Append-only invariant documentation at the migration site. The migration file's leading comment block MUST explicitly state: "**Append-only at app layer** — no `UPDATE strategies` paths from app code. Supersession is the only mutation; touches `superseded_by_strategy_id` ONLY. Enforced application-side by [`lib/strategy-core/supersession.ts:assertSupersessionOnlyUpdate`](../../../../../lib/strategy-core/supersession.ts:87)." This is documentation, not DB-level enforcement (DB-level enforcement via trigger/policy deferred per Engineer DRI Decision option below; the architecture flags this as defense-in-depth, not blocking).
- [ ] **AC 8** — No new indexes ship in this story (per the architecture DDL which doesn't specify any). Engineer DRI Decision: defer indexes until query patterns surface in CB-3.3 / CB-4. Document the decision inline in the migration's leading comment. Alternative (if Engineer prefers) — pre-create `idx_strategies_created_by_user_id` (the dashboard-list-strategies query path) + `idx_strategies_superseded_by` (the active-strategy resolution path). Engineer commits at build.
- [ ] **AC 9** — Gates: `pnpm typecheck`, `pnpm lint`, `pnpm test`, `pnpm build` all pass. Test count goes ~458 → ~468 (+~10). No new DB rows created at test time (no live DB calls); fixture-roundtrip + file-grep only. **Migration deploy verification deferred to the post-merge production deploy** — once PR is merged, Vercel auto-applies the migration to production (per [`lib/db/migrate.ts`](../../../../../lib/db/migrate.ts) pipeline verified 2026-06-07 per `docs/status.md`); Engineer/operator confirms via Vercel build log that `Applying 0004-strategies.sql...` line appears.

## Standard Experience Checklist

CB-3.2 is a pure DB migration story; no UI surface. All 6 categories `n/a`.

- [ ] **Navigation** — `n/a — no UI surface in this story; pure SQL migration applied at Vercel build via lib/db/migrate.ts. Form UI lives in CB-3.3.`
- [ ] **States** — `n/a — pure SQL migration. State transitions are: schema-without-strategies → schema-with-strategies. The migrate runner's transaction wrapper handles atomicity (per lib/db/migrate.ts:95-98); no UI states ship in this story.`
- [ ] **Feedback** — `n/a — no UI feedback surface. Migration failure surfaces in Vercel build logs; success surfaces as "Applying 0004-strategies.sql..." log line per existing migrate runner pattern. Future form UI (CB-3.3) translates validation errors into inline display.`
- [ ] **Accessibility** — `n/a — no rendered UI in this story; accessibility surfaces at CB-3.3 form UI.`
- [ ] **Edge cases** — `n/a — covered by AC 3 (migration runs idempotently + fails-loud on shape divergence) + AC 5 (Zod boundary cases: empty assets / >5 assets / position_size_usd=0). DB-level edge cases (concurrent migration application, partial-transaction rollback) are handled by lib/db/migrate.ts's transaction wrapper.`
- [ ] **Cross-surface consistency** — `n/a — single-target stack (web only per compass/config.yaml canary_artifacts). No mobile/native; no cross-surface dimension applies. The strategy-core/DB shape consistency (AC 5 roundtrip test + AC 6 CHECK-vs-Zod alignment) is the relevant consistency dimension and is covered.`

## Tech notes

The migration is materialization of [bet architecture Decision #4](../../architecture.md#4-strategies-db-schema-overrides-foundations-strategies-placeholder-mention) — Engineer must produce the SQL verbatim from that section, NOT improvise. Per Compass refusal rule #4 (do not improvise architectural decisions), any drift from the documented DDL is a spec violation requiring `/create-bet-architecture` re-engagement, not silent in-place modification.

**Reuses CB-3.0 types directly — NO duplicate type definitions:**

Per AC 5, the DB-Zod-roundtrip test validates that the planned `strategies` row shape IS the `Strategy` Zod type from [`lib/strategy-core/types.ts:110-129`](../../../../../lib/strategy-core/types.ts). Engineer MUST NOT introduce a parallel `DbStrategyRow` type or similar; the `Strategy` type is the contract. If a DB driver returns a value in a shape `StrategySchema` can't `coerce`, the fix is to amend `StrategySchema` (with concurrent architecture amendment if the shape change is load-bearing), NOT to introduce a separate row type. Round-1 risk: Engineer adds a second type "for clarity" — call it out as a spec violation at PR review.

**Architecture Issue #1 resolution (open at architecture creation; CLOSED at this story drafting):**

> "Determine bot_sessions migration ownership — does CB-3.2 ship the bot_sessions table or just the FK column?"

**Resolution: ONLY the FK column.** `bot_sessions` table created in `0001-init.sql:23-30` (v1 foundation scaffold). CB-3.2's migration uses `ALTER TABLE bot_sessions ADD COLUMN active_strategy_id text REFERENCES strategies(id)`. The architecture artifact will be updated to mark this Issue closed with the resolution rationale + pointer to this story.

**Engineer DRI Decisions called out (Engineer commits at first build commit):**

1. **Migration filename = `0004-strategies.sql`.** Per the migrate runner's lexical-sort pattern + the existing `0001-init.sql` / `0002-auth-users-singleton.sql` / `0003-auth-tables-rls.sql` series. Engineer commits this as Decision #1; no real alternative.

2. **`CREATE TABLE strategies` (NOT `CREATE TABLE IF NOT EXISTS`).** Mirrors `0001-init.sql`'s pattern. Fails-loud if a `strategies` table already exists with a different shape (manual hot-fix scenario). The `_migrations` tracking table prevents re-application via the runner; bare `CREATE TABLE` provides defense-in-depth against out-of-band schema changes. Engineer commits this as Decision #2; alternative (`IF NOT EXISTS`) explicitly rejected.

3. **Index strategy at this story = none (deferred per AC 8).** Engineer commits this as Decision #3 in the migration comment. Alternative: pre-create `idx_strategies_created_by_user_id` + `idx_strategies_superseded_by`. Rejected at this story because query patterns aren't yet established (CB-3.3 form fetches will surface the access patterns); creating indexes speculatively wastes write throughput. CB-3.3 or CB-4 can add indexes in a follow-up migration.

4. **DB-level append-only enforcement (trigger / RLS policy) = DEFERRED.** Per AC 7, the migration documents the invariant; application-side enforcement via `lib/strategy-core/supersession.ts:assertSupersessionOnlyUpdate` is sufficient at MVP. DB-level enforcement (PostgreSQL trigger that aborts on non-supersession UPDATE) is defense-in-depth and adds complexity; defer to a follow-up `/ops` migration if app-side enforcement ever has a bug. Engineer commits this as Decision #4.

5. **`db/schema.sql` sweep.** Engineer updates the canonical reference file per AC 4. The existing file uses `CREATE TABLE IF NOT EXISTS` (different from the migration's bare `CREATE TABLE` — that's correct per the file's stated role as a canonical reference, not a migration). Maintain the existing section structure (product entities together; auth tables together). Engineer commits this as Decision #5.

6. **No app-code DB queries ship in this story.** CB-3.3 ships the `INSERT strategies` + `UPDATE bot_sessions.active_strategy_id` paths. Engineer MUST resist the temptation to add a `lib/strategy/db.ts` query layer here "while we're at it" — that's CB-3.3 scope; mixing a migration story with query-code-shape decisions creates review-cycle noise. Engineer commits this as Decision #6.

### What this story does NOT include

- `INSERT` / `UPDATE` paths in app code — CB-3.3 (form save action)
- `bot_sessions.active_strategy_id` activation logic in app code — CB-3.3 or CB-3.4
- Form UI + Playwright e2e — CB-3.3
- Per-asset-class table partitioning / sharding — out of MVP scope
- Audit-log table (separate from supersession FK) — already covered by the supersession pattern per architecture Decision #4 + brief PM DRI Decision #3
- DB-level trigger enforcing append-only (Engineer DRI Decision #4 defers)
- Indexes (Engineer DRI Decision #3 defers; AC 8)

### Why this story ships AFTER CB-3.1 but BEFORE CB-3.3

CB-3.0 ships the Zod types (in-memory contracts). CB-3.1 ships the first real adapter (proves the abstraction works against live data). CB-3.2 ships the DB substrate that persists the contract. CB-3.3 then has both the in-memory types AND the DB table to wire the form save action into. Reversing the order (e.g., CB-3.3 before CB-3.2) would force CB-3.3 to either mock the DB layer or ship its own migration mid-story — both bad shapes.

The order ALSO means the architecture's open Issue #1 (`bot_sessions` ownership) gets resolved BEFORE the form UI ships, so CB-3.3 inherits a clean activation path. Resolution happens at THIS story's drafting (see Description + Tech notes above): the answer is "FK column only; table already exists."

## DRI Log

### Decisions

- [2026-06-08] [PM] **CB-3.2 ships ONLY the FK column on `bot_sessions`, NOT a second creation of the table** — architecture Issue #1 RESOLVED at story drafting
  - **Rationale (required):** `bot_sessions` table created in `0001-init.sql:23-30` at v1 foundation scaffold. Recreating it (even with `IF NOT EXISTS`) is wrong-shape: would either fail-loud (no-op for CB-3.2's actual job) or silently mask schema drift. The clean shape is `ALTER TABLE bot_sessions ADD COLUMN active_strategy_id`. The architecture artifact will be amended to mark Issue #1 closed + pointer to this story.
  - **Area (required, tag):** data-model / migration-ownership / cross-artifact-sweep
  - **Alternatives considered (required):** ship `CREATE TABLE IF NOT EXISTS bot_sessions` defensively (rejected — wrong shape; the migrate runner's `_migrations` table already tracks 0001 as applied; CB-3.2 has no business asserting bot_sessions existence); split bot_sessions FK into its own migration (0005-bot-sessions-fk-strategies.sql) (rejected — both DDLs are CB-3 scope; one migration keeps the unit of change atomic at the schema-state level); defer FK column to CB-3.4 activation story (rejected — splits the schema across two stories; CB-3.3 form UI would have no table to write activation into when it ships)
  - **Reversibility:** trivial — if Engineer discovers at build time that `bot_sessions` was somehow dropped between v1 scaffold and CB-3.2 ship (vanishingly unlikely; would have broken CB-1 onwards), Engineer surfaces as a Risk and re-runs the architecture-Issue-resolution check
  - **Closes:** architecture Issue #1 (open at architecture creation 2026-06-08; resolved at story drafting 2026-06-08)

- [2026-06-08] [PM] **CB-3.2 reuses CB-3.0's Zod types directly — NO new TypeScript types ship in this story**
  - **Rationale (required):** Per CB-3 brief Stories forecast: "reuses `lib/strategy-core/types.ts` Zod schemas (no duplicate type definitions)." CB-3.0's `Strategy` type IS the row shape (top-level snake_case to match DB columns; inner jsonb camelCase per the convention split documented at `types.ts:13-28`). Introducing a parallel `DbStrategyRow` (or similar) would create two sources of truth for the same data; future schema changes would require keeping both in sync. AC 5's DB-Zod-roundtrip test is the structural enforcement of this decision.
  - **Area (required, tag):** type-discipline / single-source-of-truth / extraction-readiness
  - **Alternatives considered (required):** introduce `DbStrategyRow` type "for clarity" (rejected — see rationale; two sources of truth is anti-pattern); use Zod's `.passthrough()` to allow arbitrary extra DB columns (rejected — fails-quietly on schema drift; the existing `StrategySchema` shape is the contract); use a separate row schema with explicit column-name mapping (rejected — duplicates types.ts; defeats the strategy-core extraction path)
  - **Reversibility:** trivial — if a real shape mismatch surfaces (e.g., DB driver returns timestamptz in a format `z.coerce.date()` can't handle), amend `StrategySchema` rather than introducing a second type
  - **Surfaced by:** CB-3 brief Stories forecast 2026-06-08 — "reuses CB-3.0's Zod types directly"

- [2026-06-08] [PM] **Migration file shipped at the same time as `db/schema.sql` updates — same PR**
  - **Rationale (required):** The canonical schema file (`db/schema.sql:1-3` comment) is the source-of-truth reference for the schema's intended state. Shipping the migration without updating the canonical file creates drift between "what the migration applied" and "what the canonical reference documents." Past PR retrospectives (per `docs/status.md` "Status.md internal-consistency drift" observation lines 78-79) show that cross-file sweeps must happen in the same PR — deferring to a follow-up creates pattern-multiplying drift. CB-3.2 ships both files together.
  - **Area (required, tag):** cross-artifact-sweep / consistency-discipline
  - **Alternatives considered (required):** ship migration first; sweep schema.sql in a follow-up `/ops` PR (rejected — past `status.md` drift pattern shows this creates load-bearing inconsistencies); skip schema.sql entirely (rejected — file's stated role as canonical reference would degrade silently)
  - **Reversibility:** trivial — single-file edit if a divergence ships

### Risks

- [2026-06-08] [PM] **Schema-text drift between migration file and `db/schema.sql` canonical** — Engineer updates one but not both
  - **Likelihood (required):** medium (PR scope mixes a SQL file and a canonical reference; easy to push one and forget the other)
  - **Impact (required):** low-to-medium (drift between canonical schema and applied migrations confuses future-Engineer + masks intended-state checks; not a production bug, but reads as "the docs are wrong" until caught)
  - **Mitigation (required):** AC 4 explicitly requires both files; PM DRI Decision #3 above codifies the cross-artifact-sweep discipline. Codex review will flag mismatch as an ISSUE; recovery is single-file edit.
  - **Area (required, tag):** documentation / cross-artifact-sweep

- [2026-06-08] [PM] **DB CHECK constraint definitions diverging from Zod constraints over time**
  - **Likelihood (required):** medium (two layers of enforcement; one drifts when the other is amended)
  - **Impact (required):** low-to-medium (DB CHECK is the load-bearing safety; Zod is the early-feedback layer; divergence weakens defense-in-depth)
  - **Mitigation (required):** AC 6 ships an alignment test that asserts every documented DB CHECK has a corresponding Zod constraint. Test is plain-text grep; cheap to run; high-signal failure mode. Future migration that adds a CHECK constraint must also amend `validate.ts` — alignment test catches the omission.
  - **Area (required, tag):** validation / consistency-discipline / defense-in-depth

- [2026-06-08] [PM] **Migration applies but production deploy build fails downstream (e.g., new column breaks an existing query)** — partial-state risk
  - **Likelihood (required):** low (CB-3.2's migration is additive; new table + new nullable column; no existing query references the new shapes)
  - **Impact (required):** low (the existing routes don't read `strategies` yet; CB-3.3 wires the writes/reads. Rollback via Supabase point-in-time recovery is documented in runbook)
  - **Mitigation (required):** the migrate runner wraps each migration in a transaction (`lib/db/migrate.ts:95`); a failing DDL rolls back atomically. Per `docs/status.md` 2026-06-07 entry, the Vercel auto-migrate pipeline is verified end-to-end. Operator confirms via Vercel build log after PR merge.
  - **Area (required, tag):** deploy / migration-runner

### Issues

_None at story creation. Engineer adds as discovered during /build._

## Tests

_Engineer writes tests co-located with code:_
- _DB-Zod-roundtrip: `tests/lib/strategy-core/db-roundtrip.test.ts` (~6 tests; uses CB-3.0's StrategySchema)_
- _Migration constraint alignment: `tests/db/migration-0004-constraint-alignment.test.ts` (~4 tests; reads SQL file + validate.ts; no DB connection)_

_Total: ~10 new tests. Suite goes ~458 → ~468._

_No new integration tests (no live Coinbase; no app-code DB writes ship in this story)._

## PRs

_Auto-populated as PRs open._

---

_Story closed: <pending>, brief link: docs/bets/CB-3/brief.md, architecture link: docs/bets/CB-3/architecture.md_
