# Compass Improvements Log

Real friction encountered while using Compass, with the change made to fix it. This file is the institutional memory of why the framework is shaped the way it is.

Each entry: what happened → what changed → what to watch for.

## Retro cadence

Retros every 5 entries per AGENTS.md principle #14 (soft-spec-rationalization defense via periodic pattern review). Reports — does not prescribe. Patterns surfaced feed future improvements via normal triggers.

- **Retro #001** (v0.1.8 → v0.1.12): [retros/2026-05-26-retro-001-v0.1.8-to-v0.1.12.md](retros/2026-05-26-retro-001-v0.1.8-to-v0.1.12.md)
- **Retro #002** (v0.1.13 → v0.2.2): [retros/2026-05-26-retro-002-v0.1.13-to-v0.2.2.md](retros/2026-05-26-retro-002-v0.1.13-to-v0.2.2.md)
- **Retro #003** (v0.2.3 → v0.2.7): [retros/2026-05-26-retro-003-v0.2.3-to-v0.2.7.md](retros/2026-05-26-retro-003-v0.2.3-to-v0.2.7.md)
- **Retro #004** (v0.2.8 → v0.3.5 + same-day extensions): [retros/2026-06-01-retro-004-v0.2.8-to-v0.3.5.md](retros/2026-06-01-retro-004-v0.2.8-to-v0.3.5.md) — fired at #22, **2 cycles overdue** (promised after #20); names retro-cadence-rationalization as drift signal; surfaces `[mechanical-output-verification]` as codification-ready (2 instances).

**Next retro fires after improvement #25.** (v0.3.5 is #22; v0.3.6 = #23; v0.3.7 = #24. **1 more entry needed.** Hard line still in effect — if retro slips again, retro rationalization is no longer one-off.)

## Template

```
### YYYY-MM-DD — Short title naming the friction

**Friction:** What hurt, where, and how it surfaced.

**Change:**
- Bullets describing the specific edits.

**Files touched:** comma-separated paths.

**Watch for:** future risks, follow-ups, things that could regress.
```

---

### 2026-05-24 — Researcher needed 6-category structure with defensibility as first-class

**Friction:** Researcher role had vague "gather data" guidance. Inconsistent engagement. Moat analysis (defensibility) was missing entirely from foundational product research — the single most important question on a company-level bet.

**Change:**
- 6-category research framework: user pain, competitive, technical, quantitative, trends, moat.
- Moat analysis mandatory on foundational product bets; 9 classic moat types evaluated explicitly.
- AI tools elevated to first-class research mode across all categories.
- Defensibility section added to foundation-product.md template.
- Verification checklist enforces mandatory completion.

**Files touched:** `compass/roles/researcher.md`, `compass/templates/foundation-product.md`, `compass/templates/brief.md`, `compass/workflows/setup-product.md`.

**Watch for:**
- Similar gaps for other "always engages" roles (e.g., Architect joining on every PR — is that actually happening?).
- Domain-specific moat patterns may need extension (e.g., healthcare network effects work differently).

---

### 2026-05-24 — Researcher could log-and-walk-away on vision-only sources

**Friction:** First real `/setup-product` run (flow / Agent Orchestrator brief) revealed that the v0.1.8 changes were *necessary but not sufficient*. The vision-only source doc gave the Researcher cover to log three open Issues (R-1, R-2, R-3) flagging missing user pain, persona, and competitive data — and the workflow accepted it. No evidence was produced. No moat analysis was attempted. The brief reached "ready for HITL" with placeholders everywhere and the verification gate would have passed because:
- Defensibility section was absent (template predated v0.1.8 — would have been an empty table on re-run, which the old gate allowed)
- Researcher DRI was Issues-only and the gate said "entries from PM AND Researcher" without specifying breadth
- "Findings present" was satisfied by literally any text, including TBDs

**Change:**
- Workflow step 3: explicit ban on log-and-walk-away. Vision-only sources are not a reason to defer.
- Verification: empty moat rows fail; Researcher needs Decisions + Risks (not just Issues); findings need cited evidence (not TBD or "see R-N"); HITL gate cannot pass with any unchecked item.
- Role doc: new "When the source is vision-only" subsection — vision-only is the *normal* starting state, not an exception.

**Files touched:** `compass/workflows/setup-product.md`, `compass/roles/researcher.md`, `CHANGELOG.md` (0.1.9), `compass/workflows/improvements.md`.

**Watch for:**
- Other workflows with "MUST engage" roles that don't enforce *what* the engagement produces (Architect on every PR — what's the deliverable?).
- Researcher may now over-rotate and produce thin evidence across all three categories just to clear the gate. If that happens, tighten on *quality of evidence* (citations, primary sources) rather than just presence.

---

### 2026-06-01 — Freshness detection shipped (pull-bridge round 2 — 3-slip commitment closure) (v0.3.7)

**Friction:** Three consecutive roadmap slips. v0.3.3 committed freshness detection to v0.3.4; v0.3.4 bumped to v0.3.5+; v0.3.5 bumped to v0.3.6+; v0.3.6 CHANGELOG set hard line: 4th slip triggers re-examination of whether v0.3.3 workflow-side defense is sufficient. User picked v0.3.7 = freshness detection. **The hard line worked** — it created structural pressure that overcame the rationalization-toward-higher-leverage-substantive-releases pattern.

**This is not a new Compass-original.** v0.3.7 is infrastructure shipping a previously-named pattern's round-2 mechanism. First v0.3.x release without a new Compass-original — the cadence "one Compass-original per session" broke here for legitimate reason. Whether infrastructure releases should count separately is a question for next `/retro`.

**Change:**

- **NEW: `compass/scripts/check-freshness.py`** — single-file Python 3 stdlib script. Walks `compass/` for files with `last_verified:` frontmatter; queries each `external_source`:
  - GitHub repo URLs → GitHub API releases > tags > commits (decreasing accuracy)
  - Generic URLs → HTTP HEAD/GET for `Last-Modified` header
  - Comparison: external ≤ `last_verified` → auto-bump (safe); external > `last_verified` → flag (manual review); error → flag-with-error
  - Flags: `--apply` (mutate), `--today` (deterministic CI), `--out` (write report), `--root` (override).
  - Exit 0 = all safe; exit 1 = flags or errors (signals CI to open PR/Issue).
- **NEW: `.github/workflows/freshness-check.yml`** — runs script weekly (Mondays 06:00 UTC) on Compass repo. Bumps → opens PR. Flags only → opens Issue. Everything fresh → no action. **First time `.github/workflows/` is being used in the Compass framework repo itself.**
- **`compass/scripts/README.md`** gained dedicated `check-freshness.py` section (usage / exit codes / detection strategies / accuracy honesty / automation / when-to-use).
- **`compass/framework/canon.md` `[freshness-check]` entry** — round 2 status: "deferred" → "shipped v0.3.7" with mechanism described.
- **`AGENTS.md` Workflow Structure freshness note** — round 2 status: shipped.

**First-run validation surfaced real value immediately.** Dry-run on Compass repo (`python compass/scripts/check-freshness.py`) flagged `compass/roles/reviewer.md` because Codex GitHub had a release published 2026-06-01 (same day as ship); `last_verified` was 2026-05-27. **This is the precise scenario the v0.3.3 workflow-side defense was designed for** — but it would have caught it at next `/build` invocation, not in the framework repo. Round 2 catches it at the source, before any consumer-side workflow needs to refuse. First detection event in the framework's history. **Codex review format may genuinely need re-verification** — surface as Compass-side action item independent of v0.3.7.

**Multi-consumer reality named during planning.** aura-app (at framework v0.2.x) + crypto-app (at framework v0.3.x active) with no sync mechanism between them — manual copy at consumer bootstrap, then drift indefinitely. **This is the round-3 distribution problem from v0.3.3's original framing.** Round 2 detects in the framework repo; round 3 propagates to consumers. Still deferred because round 3 requires real distribution infrastructure (auto-PR to consuming repos, version markers in consumer `compass/config.yaml`, sync tooling). v0.4+ candidate. Multi-consumer reality strengthens motivation but doesn't yet override the cadence.

**Honest scope reminder.** Detection is HTTP-level — timestamp comparison, not content semantic analysis:
- A doc page may change cosmetically without affecting Compass; the script flags it anyway.
- A CLI tool may publish a release that doesn't change its surface; the script flags it anyway.
- Auto-bump only happens when external is UNCHANGED (directional bias toward "flag rather than silently mark fresh").
- Network errors flag rather than bump.
- Semantic-level detection (did the Codex CLI surface ACTUALLY change?) requires LLM + structured-output prompting — round 2.5+ territory if false-positive flagging becomes noisy.

**Files touched (6):** new — `compass/scripts/check-freshness.py`, `.github/workflows/freshness-check.yml`. Edited — `compass/scripts/README.md`, `compass/framework/canon.md`, `AGENTS.md`, `CHANGELOG.md`, `compass/workflows/improvements.md`.

**Watch for:**
- **First-week false-positive rate.** When the workflow runs Monday 2026-06-08, how many of the flagged files are *genuinely* stale vs cosmetically-changed external sources? If false-positive rate > 50%, prioritize round 2.5 (semantic verification of flagged files via LLM). If < 25%, current accuracy bounds are acceptable.
- **GitHub API rate limits.** Unauthenticated calls cap at 60/hour. Compass currently has 1 file with freshness markers; even 100 files would be fine. If consumer-side adoption scales the marker-count significantly, the workflow may need to switch to authenticated calls (`secrets.GITHUB_TOKEN` is already passed for `gh` CLI; just need to add as `Authorization: token` header in the script). Defer until needed.
- **`.github/workflows/` directory introduction.** First time Compass repo has CI. Future workflows may follow (release tagging? doc preview? scanner runs?) — but each addition should justify itself against the "Compass is a framework, not an app" framing. Single-purpose workflows only.
- **Hard-line declarations as pattern.** The v0.3.6 CHANGELOG's "4th slip triggers re-examination" line created structural pressure that actually delivered. Worth examining in next `/retro`: is this a recurring shape (explicit slip-counters + hard-line declarations as soft-spec-hardening applied to roadmap commitments)? If yes, formalize as a Compass-original (`[hard-line-declaration]`?) — but wait for 2nd structurally-distinct instance per codification rule.
- **First detection event coincidence?** Codex GitHub released on the same day Compass shipped detection. Coincidence, OR signal about external-tool change velocity in the v0.3.x cycle? If Codex / Vercel / Next.js / Anthropic CLIs release frequently (>weekly), the freshness window of 30 days in reviewer.md may be too long — should probably be 7-14 days for fast-moving tools. Monitor 4-week flag rate before adjusting.
- **Multi-consumer drift continues until round 3.** aura-app stays at v0.2.x until consumer actively pulls or round 3 ships. If a 3rd consumer project appears (likely as Compass adoption broadens), the case for round 3 becomes overwhelming — schedule v0.4 explicitly then.
- **Infrastructure-release tracking.** v0.3.7 broke the "one Compass-original per session" cadence for legitimate infrastructure reasons. Next retro should examine whether infrastructure releases (mechanism-shipping for previously-named patterns) should be tracked separately from substance releases (new Compass-originals). Counter-correction candidate: add `release_type: infrastructure | compass-original | mixed` field to CHANGELOG entries.

**Meta-observation — the hard-line worked.** v0.3.6 CHANGELOG named the 4th-slip consequence explicitly; v0.3.7 shipped before that consequence triggered. This is the framework's discipline applied to its own roadmap: **soft commitments to future-self get rationalized away unless structurally hardened** (per Principle #14 applied recursively). The hard-line declaration is itself a structural hardening — mechanically visible, in-CHANGELOG, with a named consequence. **First instance of this pattern observably working.** Worth a name for retro consideration: `[hard-line-declaration]` or `[explicit-slip-counter]` — defer codification until 2nd instance.

**Cadence note.** v0.3.1 (Access & Data Posture) · v0.3.2 (elicitation-with-options) · v0.3.3 (freshness-check) · v0.3.4 (role-boundary) · v0.3.5 (agent-handoff + same-day extension) · v0.3.6 (mechanical-output-verification codified) · v0.3.7 (INFRASTRUCTURE — freshness detection shipped) = **7 sessions, 6 Compass-originals + 1 infrastructure release.** The cadence held for 6 consecutive sessions before its first legitimate break. Next retro fires after improvement #25 (this is #24; 1 more entry needed).

---

### 2026-06-01 — `[mechanical-output-verification]` codified + Codex review process gains Step 0 framework-registration + 4 new named anti-patterns (v0.3.6)

**Friction (informed by Retro #004):** Retro #004 fired 2 cycles overdue at improvement #22 (this is improvement #23). It surfaced `[mechanical-output-verification]` as codification-ready — 2 instances accumulated: (1) CB-1.4 dashboard proxy `.next/server/middleware-manifest.json` inspection from v0.3.5 same-day extension; (2) Codex's own self-critique from the same cycle ("Start with framework registration checks before reading functional tests" + "Prefer 'is this actually deployed by the framework?' over 'do the tests pass?'"). Same shape: inspect runtime/build artifact before trusting source-level, test-level, or narrative signals. Codification rule satisfied.

**Why now:** First time a *deferred* Compass-original candidate is being codified after accumulating 2 instances in the wild. Prior canon entries (e.g., `[freshness-check]` v0.3.3, `[elicitation-with-options]` v0.3.2) shipped with their 1st instance because the pattern itself was novel enough to name at first sight. `[mechanical-output-verification]` is the first that earned codification by *accumulated evidence* rather than *novelty at first sight*. Validates the 2-3-instance rule as a working codification mechanism, not a stalling tactic.

**Change:**

- **New `[mechanical-output-verification]` Compass-original** in `compass/framework/canon.md`. 4th enforcement-class member (joining cite-or-mark-n/a · refuse-escalate · soft-spec-hardening). Names: framework anchors (Next.js manifests / Vercel Functions output / Expo prebuild native config) + general principle (when runtime config is data-driven, source ≠ runtime — inspect runtime) + the two instances + `polished-but-broken` as the anti-pattern it closes.
- **`compass/roles/reviewer.md` gained Step 0 — framework-registration check.** Before functional analysis, Codex verifies build output / runtime artifact for changes touching framework-discovered surfaces (file-based routing, middleware auto-registration, plugin discovery, asset bundling). REQUIRED for routing-layer / discovery-layer / framework-convention changes; OPTIONAL for pure logic changes. Direct application of Codex's own self-critique point #1 + #5.
- **`compass/roles/reviewer.md` gained Step 4 — review-time freshness check.** When story or DRI Decision names a runtime behavior or file convention as load-bearing, Codex re-verifies the claim against current primary docs — does not trust story-as-written. BLOCKER promotion when claim is wrong regardless of how cleanly implementation follows the (incorrect) story. This is `[freshness-check]` applied at review time, not just doc-load time.
- **`compass/roles/reviewer.md` Anti-patterns gained 4 new named entries:**
  - `polished-but-broken` (formalized from v0.3.5)
  - `direct-import-test-suspicious` (Codex point #2 — when feature depends on framework discovery, direct-import tests bypass the discovery mechanism)
  - story-claim-trust-without-primary-doc-verification (load-bearing story claims must be re-verified at review time)
  - `narrow-bug-focus` (Codex's own self-named failure mode — finding real bugs at functional layer while missing higher-altitude framework-legality issues)
- **`compass/workflows/build.md` Phase 2 step 7** gained explicit `[mechanical-output-verification]` citation. Retrofit of formal pattern name onto the existing implementation from v0.3.5 same-day extension.
- **`AGENTS.md` Workflow Structure section** gained note about `[mechanical-output-verification]` as 4th enforcement-class. Explicit balance framing: **4 enforcement : 4 usability**.
- **`compass/templates/workflow-template.md` gained inline commentary** about applying the pattern when workflows include build/deploy/framework-discovery steps.
- **`compass/framework/canon.md` `[freshness-check]` entry extended** with review-time application note (the pattern applies to story claims at review time, not just to Compass-doc-load time).
- **CHANGELOG v0.3.6 entry** documents all of the above + 3rd consecutive freshness-detection slip (with hard line — if it slips a 4th time, the workflow-side defense from v0.3.3 must be re-examined).

**Codex's own self-critique drove half the changes.** First time Compass evolution was driven by a reviewer agent's own retrospective rather than user friction or framework-on-framework reflection alone. Worth watching whether this pattern recurs:
- Point 1 (framework registration before tests) → Step 0
- Point 2 (direct-import-test suspicion) → named anti-pattern
- Point 3 (re-verify load-bearing framework claims) → Step 4 review-time freshness
- Point 4 (AC contradictions earlier) → **NOT integrated** (single instance only, defer per codification rule; surfaced for next retro)
- Point 5 (prefer "is this deployed?" over "do tests pass?") → embedded in Step 0 reasoning + canon entry

**Retro #004 → v0.3.6 framing held cleanly.** The retro reported findings; v0.3.6 was the prescriptive response. Retro framing ("reports — does not prescribe") survived its first real-world test where it directly preceded a substantive release. The two layers (reflection / action) stayed separable. Framework-on-framework working.

**Files touched (7):** edited — `compass/framework/canon.md` (mechanical-output-verification entry + freshness-check review-time extension), `AGENTS.md` (4th enforcement-class note + 4:4 balance framing), `compass/roles/reviewer.md` (Step 0 + Step 4 + 4 new named anti-patterns), `compass/workflows/build.md` (canon reference in step 7), `compass/templates/workflow-template.md` (inline commentary), `CHANGELOG.md` (v0.3.6 entry), `compass/workflows/improvements.md` (this entry).

**Watch for:**
- **Will Step 0 reduce `polished-but-broken` recurrence in next reviews?** The retrospective evidence base for `[mechanical-output-verification]` is 2 instances; the test is whether real reviews (next 5-10 PRs across aura-app and future Compass consumers) catch framework-registration issues that previously slipped through. If they do — codification was the right move. If `polished-but-broken` keeps recurring — Step 0 is insufficient; escalate to scanner check or build-time gate.
- **Will Codex actually apply Step 0 vs rationalize past it?** Codex's own retrospective produced these points. The codification embeds them into the role file. But Principle #14 says: agents under load rationalize away constraints, even ones they helped author. Watch for Codex review comments that skip Step 0 for "obvious" cases — that's the rationalization surface re-opening.
- **First-time codification-by-accumulated-evidence — pattern or one-off?** v0.3.6 is the first deferred Compass-original promoted after 2 instances. If the next 2-3 codifications also follow accumulated-evidence path (vs novelty-at-first-sight), the 2-3-instance rule is a working codification mechanism. If accumulated-evidence codification stays one-off, examine why (novelty-at-first-sight may be the dominant path, with deferred-then-codified rare).
- **AC consistency check (Codex point #4) recurring?** Single instance now (CB-1.4). If a 2nd structurally-distinct AC-contradiction instance surfaces, `[ac-consistency-check]` graduates to codification candidate. Probably belongs in `/create-story` Standard Experience Checklist.
- **Freshness detection 4th slip.** v0.3.6+ continues the deferral. Hard line in CHANGELOG: if 4th slip happens, workflow-side check from v0.3.3 must be re-examined. This is the **structural escalation mechanism** — same shape as retro-counter visibility in v0.3.0-alpha. The slip is now load-bearingly visible.
- **5-shape catalog vs 6-shape pressure.** v0.3.6 added a member to existing shape, did not introduce 6th shape. If a future Compass-original (`[defense-in-depth-marker]`, `[ac-consistency-check]`, or other) doesn't fit existing shapes, framing needs sharpening. Worth re-examining the catalog at every 3rd release.
- **Will the reviewer-agent-self-critique pattern recur?** v0.3.6 was driven significantly by Codex's own retrospective. If future reviewer-agent retrospectives surface similar concrete patterns, the framework should formalize a way to capture and integrate them (a `/reviewer-retro` workflow? A standing section in `/retro` output?). Single instance now; watch.

**Meta-observation — `[mechanical-output-verification]` rebalances the catalog.** Prior to v0.3.6: 3 enforcement (cite-or-mark-n/a · refuse-escalate · soft-spec-hardening) : 4 usability (interaction · freshness · observability · handoff). Post-v0.3.6: 4 : 4. The framework was tilting toward usability-shapes outpacing enforcement; v0.3.6 restores balance. **Whether this matters or is incidental is itself a question for retro #005.** If enforcement-class growth stalls again, the framework may be structurally biased toward making itself easier-to-use over making itself harder-to-violate — worth examining whether that's intentional or accidental.

**Cadence held.** v0.3.1 (Access & Data Posture) · v0.3.2 (elicitation-with-options) · v0.3.3 (freshness-check) · v0.3.4 (role-boundary) · v0.3.5 (agent-handoff + same-day extension) · v0.3.6 (mechanical-output-verification codified) = **one Compass-original per session, 6 sessions running.** Retro #005 fires at improvement #25 (3 more entries needed).

---

### 2026-06-01 — `[agent-handoff]` Compass-original + agent-agnostic GitHub Actions reviewer template + `/build` Phase 5 automated path (v0.3.5)

**Friction:** User is close to creating an end-to-end app in aura-app — `/build` works, Codex reviews work, but the Claude → Codex handoff is the last manual seam in an otherwise automated loop. Three friction points per review cycle: (1) tool switch (leave Claude Code, open terminal, invoke `codex`); (2) manual context transfer (paste reviewer prompt + PR number); (3) manual return signal (tell Claude there are findings to address). User is the orchestrator running the back-and-forth — that's the friction. User asked: *"how can we automate."*

**User direction — two questions answered:**
- **Automation shape = Option A (GitHub Action runs reviewer on PR open).** Action template ships in `compass/scripts/`; consumers copy to `.github/workflows/`. Reviewer runs headless in CI, posts findings on PR. Claude reads PR comments next time invoked. Cleanest path; both tools already have GitHub MCP. Manual fallback always supported.
- **Generality = agent-agnostic.** User said: *"ideally - AI → AI where AI can be Claude, Codex, or any other."* Template parameterized over reviewer agent (Codex default-enabled, Claude headless / Gemini / generic CLI commented as alternatives). Pattern abstracts over which AI plays the reviewer role.

**Pattern:** `[agent-handoff]` — when a workflow routes work between AI agents, Compass defines a 5-piece handoff shape so the user is not the bridge.

| Piece | Value for Engineer → Reviewer |
|---|---|
| Trigger artifact | The PR (opened or synchronized) |
| Trigger event | `workflow_run` on CI completion |
| Context window | `pr.diff` + reviewer prompt file |
| Output medium | PR comment (via `gh pr comment`) |
| Loop signal | Claude reads PR comments via GitHub MCP next session |

**Change:**
- **New `[agent-handoff]` Compass-original** in `compass/framework/canon.md`. 5-piece shape + first instance pointer.
- **NEW: `compass/scripts/agent-handoff.yml`** — GitHub Actions template. Triggers on `workflow_run` after CI green on a pull_request event; resolves PR number with `gh pr list`; captures diff with `gh pr diff`; invokes reviewer agent (one of four blocks); posts findings via `gh pr comment`. Permissions: `contents: read` + `pull-requests: write`.
- **`compass/scripts/README.md`** gained a dedicated `agent-handoff.yml` section with setup steps, handoff-shape table, agent-agnostic blocks summary, accuracy honesty (vendor CLI drift, replay/cost caveats, auth model), and manual-fallback note. Section carries its own freshness markers tracking Codex / Claude Code / Gemini CLI external sources.
- **`/build` Phase 5 step 13** references the automated path: "If `.github/workflows/ai-review.yml` is installed (per `compass/scripts/agent-handoff.yml`), the reviewer fires automatically on CI-green; otherwise manually." Both paths terminate at same place; automation removes tool-switch + manual prompt paste only.
- **`compass/roles/reviewer.md`** gained "How you're invoked" section (automated via CI / manual fallback). Notes freshness-check precondition runs before either path.
- **`compass/templates/workflow-template.md`** gained inline commentary on the agent-handoff pattern as optional addition when workflows route across agents.
- **`AGENTS.md`** Workflow Structure section gained `[agent-handoff]` note + explicit "Compass-originals catalog now spans five shapes" framing. `compass/scripts/` directory framing updated to reflect mixed contents (script + template).
- **CHANGELOG** `[0.3.5] — 2026-06-01` entry.

**Roadmap shift (2nd consecutive bump).** v0.3.3 committed v0.3.4 to freshness detection; v0.3.4 already bumped to v0.3.5+; this round bumps it again to **v0.3.6+**. Token tracking and handoff automation were higher-leverage given the actual user friction trail. Two consecutive bumps is a yellow flag — surface in next `/retro` to confirm freshness detection isn't being systematically deferred. The user-side defense (workflow-side freshness check from v0.3.3) and the agent-handoff template's own README freshness markers stand until detection ships.

**Files touched (9):** new — `compass/scripts/agent-handoff.yml`. Edited — `compass/framework/canon.md`, `compass/templates/workflow-template.md`, `compass/workflows/build.md`, `compass/roles/reviewer.md`, `AGENTS.md`, `CHANGELOG.md` (0.3.5), `compass/scripts/README.md`, `compass/workflows/improvements.md`.

**Watch for:**
- **Vendor CLI drift is real.** The `npm install` packages and CLI flags shipped in `agent-handoff.yml` are best-effort references. README carries `last_verified: 2026-06-01` + 30-day window tracking Codex / Claude Code / Gemini CLI external sources. **Likely candidate for the v0.3.6+ freshness-detection script** — when the detector ships, agent-handoff.yml is one of its first watched files.
- **No replay protection.** Every CI green triggers a reviewer invocation; CI re-runs trigger re-reviews. For high-PR-volume teams, README names this as a future-script candidate (handoff replay — gate on labels or check existing review comments). If aura-app or another consumer reports noisy duplicate reviews, build the gate.
- **Cost.** Every PR (and every push triggering CI re-run) invokes the reviewer. High-volume repos should budget; framework-side, no enforcement. Token-usage parser (`token-usage.py`) helps measure but doesn't gate.
- **Manual fallback degradation.** Risk: as the automated path becomes default, the manual path documentation rots (reviewer prompt path drifts, instructions go stale). Mitigation: `compass/roles/reviewer.md` "How you're invoked" section documents both paths inline so they stay co-located. If the manual path becomes truly vestigial across multiple consumers, the framework can drop it cleanly — but not before evidence.
- **Auth model assumptions.** Template uses `secrets.GITHUB_TOKEN` for PR comment posting and a vendor secret for the reviewer agent. Teams with stricter auth (org-level secret restrictions, enterprise GitHub Apps) will need to customize. README names this; no framework-side enforcement.
- **2nd-instance trigger for principle #17.** Per codification rule (≥2-3 applications before promoting to AGENTS.md principle), wait for a 2nd workflow adopting `[agent-handoff]`. Likely candidates: a future `/research` workflow (Researcher → Architect handoff) or a `/triage` extension (Triager → Engineer handoff). v0.3.x will surface the right next workflow when value emerges.
- **Codex CLI specifics need user verification on first run.** The shipped `codex exec --prompt-file ... --input ... --output ...` invocation is placeholder reference. User should verify against current Codex CLI docs on first deploy in aura-app; bump `last_verified` after confirming.

**Meta-observation — `[agent-handoff]` is the 5th Compass-original shape.** Catalog now spans: **enforcement** (cite-or-mark-n/a · refuse-escalate · soft-spec-hardening — what the workflow REQUIRES) · **interaction** (elicitation-with-options — how the workflow ASKS) · **freshness** (freshness-check — how the workflow STAYS CURRENT) · **observability** (role-boundary — how the workflow EXPOSES STRUCTURE) · **handoff** (agent-handoff — how the workflow ROUTES across agents). The split between "what the framework demands" vs. "how the framework makes itself usable" is now 3:4 — enforcement is 3 patterns, the other four "usability" shapes are 4 patterns. Worth watching whether enforcement gets a 4th member or whether usability axes continue to outpace.

**Cadence held.** v0.3.1 (Access & Data Posture) · v0.3.2 (elicitation-with-options) · v0.3.3 (freshness-check) · v0.3.4 (role-boundary) · v0.3.5 (agent-handoff) = **one Compass-original per session, 5 sessions running.** Next `/retro` (fires at improvement #20) is close. Retro should specifically examine: (a) why freshness detection has slipped twice, (b) whether the 5-shape catalog framing holds or whether finer-grained organization is needed, (c) which Compass-original is closest to AGENTS.md-principle codification (likely `[elicitation-with-options]` first — 2nd instance trigger could fire on `/setup-product` retrofit).

**Aura-app payoff:** the YAML is immediately drop-in for aura-app. After landing, user can: (1) `cp compass/scripts/agent-handoff.yml ~/apps/aura-app/.github/workflows/ai-review.yml`; (2) set `OPENAI_API_KEY` GitHub secret; (3) confirm CI workflow name in the YAML; (4) verify Codex CLI install command + flags. Manual loop disappears on the next PR.

**Real-world validation — 2026-06-01 (same day as ship).** Reported by user mid-session, surfaced by the Engineer agent running CB-1.4 in aura-app (the dashboard proxy bet).

- **Context:** Engineer was implementing CB-1.4's proxy in aura-app. The proxy at `proxy.ts` is the sole protection layer in practice today (no real dashboard route handlers exist yet).
- **What fired:** During `/build` Phase 2 (Engineer implements), the Vercel routing-middleware skill loaded. The skill carried current knowledge of **CVE-2025-29927** (Next.js middleware bypass vulnerability) and the broader principle that middleware/proxy auth should never be sole protection.
- **What surfaced:** Defense-in-depth as architectural treatment, not as architecture. Specifically: `x-session-user-id` + `x-session-id` headers injected by the proxy are **convenience, not auth claims**; future protected route handlers MUST re-verify session themselves; the proxy is one layer, not the layer.
- **How it was captured:** (a) source-code marker at the top of `proxy.ts` making the convention impossible to miss; (b) Engineer DRI Decision documenting the lineage (skill → CVE reference → defense-in-depth principle → marker convention); (c) future-handler obligation encoded as a project convention.
- **Patterns validated together:** skill discipline (AGENTS.md — load the skill, don't pattern-match) · soft-spec-hardening (#14 — "middleware auth as sole protection" is exactly the rationalization surface the principle closes) · DRI logging (#4 — Decision captures *why*, not just *what*) · role-boundary source-code marker (convention encoded at file level, survives doc drift).
- **Attribution nuance:** the v0.3.3 freshness gate as written is `/build` Phase 5 step 12a on `compass/roles/reviewer.md` (Codex review format), not Phase 2. The Vercel skill loading is a **separate mechanism** — Claude Code's skill ecosystem updates through Vercel + Anthropic channels, not through Compass `last_verified` markers. The agent reported it as "v0.3.5's freshness gate" but technically the two are decoupled. **The broader observation stands:** the v0.3 thesis is that framework discipline + skill ecosystem + tool currency compose to surface current knowledge at design time. This CVE catch is direct evidence of that thesis.
- **Future codification candidate (2-3-instance rule applies — defer):** the "convenience headers ≠ auth claims" pattern with its source-code-marker + DRI-Decision + future-handler-obligation shape is a defense-in-depth principle with reach beyond CB-1.4. Candidates: new scanner check (`route handlers re-verify session even when proxied`, Production Ready phase, suppressible); Story Standard Experience Checklist sub-bullet for auth-touching bets; new Compass-original `[defense-in-depth-marker]` (would be 4th enforcement-class member, resetting catalog balance to 4:4 enforcement-vs-usability). **Wait for a 2nd instance** in a separate bet/repo before codifying. Surface in next `/retro`.
- **Why this matters for next `/retro`:** retros surface (a) what patterns are working, (b) what surfaces are still rationalization-prone, (c) what to codify next. This is the first observed evidence of v0.3's discipline catching a CVE-relevant insight *at design time, before deploy*. The retro should specifically cite CB-1.4 / CVE-2025-29927 as concrete validation of the freshness-check-class + skill-load-class composition.

**Lessons from CB-1.4 cycle — same-day extension (2026-06-01).** Three implementation lessons reported by user mid-session after running CB-1.4 through both Codex and Claude as reviewers.

**Lesson 1 — "Polished narrative + green tests" can lock in fundamentally broken behavior.** Mechanical verification of build OUTPUT (not just build PROCESS) is needed. Aura-app CB-1.4 surfaced this when `.next/server/middleware-manifest.json` inspection revealed the gap between source intent and runtime config — build succeeded, tests passed, manifest was wrong.

  **Action:** `/build` Phase 2 step 7 extended with **build-artifact inspection** sub-bullet covering Next.js manifests (middleware / routes / app-paths / prerender) · Vercel functions output · Expo native config + bundle · general principle (when runtime config is data-driven, source ≠ runtime; inspect runtime). Named anti-pattern: **`polished-but-broken`** — tests pass, build succeeds, narrative coherent, principles cited, behavior wrong. Sharper version of Principle #14 — the soft spec being rationalized is now "the build succeeded" / "the tests pass" / "the principle is named in the comment" each of which the agent passes while behavior is broken. The fix: mechanical inspection of the actual artifact.

**Lesson 2 — Same-model reviewer + same-model author share aesthetic priors. Multi-model review is structurally load-bearing, not procedural.** User empirically validated during CB-1.4: ran same diff through both Codex (different model than Engineer) and Claude (same model) as reviewer; **Codex outperformed**. The "independent model" framing in pre-v0.3.5 AGENTS.md was light prose; this lesson hardens it with empirical evidence and explicit structural rationale.

  **Action:** `AGENTS.md` "Tool division of labor" gained a hardened paragraph naming the structural reason (shared aesthetic priors → blind-spot overlap) + empirical citation (CB-1.4 dual-review experiment) + explicit "not cost-equivalent" framing. `compass/scripts/agent-handoff.yml` header comment gained a ⚠ note explaining why Codex is default-enabled (structural correctness, not ergonomic preference) and explicitly naming the Claude-headless block as **fallback, not equivalent alternative**. Hardens the existing split against future "consolidate for cost" pressure that would silently re-introduce the blind-spot overlap.

**Lesson 3 — Skill load-time freshness surfaces *information about the framework*, not *validation that the implementation uses it correctly*.** Sharper version of yesterday's defense-in-depth observation. The Vercel skill said "principle X exists"; nothing mechanically verified the implementation applied principle X. **Information surfacing ≠ use verification.**

  **Action: surface in next `/retro` as a freshness-check-class limitation.** Not actionable as a Compass-original today — verification mechanisms (pattern grep / scanner check / explicit reviewer checklist item / static analysis rule) are heavier infrastructure than this round can carry. **Defer codification per 2-3-instance rule.** Lesson 1's build-artifact-inspection extension closes part of this gap (mechanical verification at build-output level) while the implementation-pattern-check version waits for accumulating evidence.

**Codification deferrals named explicitly:**
- **`[mechanical-output-verification]` Compass-original** — 1st instance now (build-artifact inspection); wait for 2nd before promoting to canon entry. Would be 4th enforcement-class member (joining cite-or-mark-n/a · refuse-escalate · soft-spec-hardening), resetting catalog balance to 4:4 enforcement-vs-usability.
- **`[implementation-use-verification]` Compass-original** (lesson 3) — 1st surface visibility now; wait for at least 1 concrete instance before considering codification. Mechanism candidates when it lands: scanner check (pattern grep) · reviewer checklist item · static analysis rule.
- **Multi-model review as numbered principle** — NOT codified separately. The existing AGENTS.md "Tool division of labor" + hardened structural rationale carries the weight. Promotion to a numbered AGENTS.md principle (#17+) would happen only if a 2nd model-pair-blind-spot instance surfaces in a structurally distinct context (e.g., Architect-pair, Researcher-pair, future role-pairing).

**Scope choice — Medium, not Heavy.** Heavy (a v0.3.6 release with new Compass-original) would be premature for 1st-instance build-output-inspection. The Phase 2 extension is correct as a **direct expansion of existing /build step 7** (joining typecheck/lint/test/build/runtime-config-audit as another sub-bullet); the structural-rationale addition is correct as a **direct extension of existing AGENTS.md** "Tool division of labor" paragraph. Naming as v0.3.6 would imply a versioned milestone for what is genuinely a same-day v0.3.5 cycle. Per one-Compass-original-per-session discipline, codification waits.

**Files touched (4):** edited — `compass/workflows/build.md` (Phase 2 step 7 + `polished-but-broken` anti-pattern), `AGENTS.md` (Tool division of labor structural rationale + CB-1.4 empirical citation), `compass/scripts/agent-handoff.yml` (header comment about Codex default rationale), `compass/workflows/improvements.md` (this lessons subsection).

**Watch for:**
- **Build-artifact inspection generalization.** Current extension names Next.js / Vercel / Expo (matching aura-app's stack). Other framework-specific artifact locations (Remix, SvelteKit, Vite, Astro, Nuxt, Rails, Django, etc.) need additions when a project using one surfaces friction. The "general principle" sub-bullet should carry the weight in the interim — agents should generalize ("if this framework writes runtime config to disk, find and inspect it"), not pattern-match strictly to the named examples.
- **`polished-but-broken` at later phases.** The extension is in Phase 2 (Engineer self-check). Codex in Phase 5 also has access to build artifacts and could catch what Phase 2 missed. If Codex starts repeatedly catching `polished-but-broken` patterns Phase 2 should have caught, that's signal Phase 2 inspection is incomplete — expand the framework list or escalate to a scanner check.
- **"Information surfacing ≠ use verification" generalization.** This lesson connects to a larger class — Compass can name principles (#14, #15, #16); something separate has to mechanically verify implementation applies them. The verification mechanism is the gap. Watch for a 2nd instance where the gap manifests (e.g., a workflow says "do X"; the postcondition is "did the agent claim to do X" not "did X happen"). When 2-3 instances accumulate, `[implementation-use-verification]` becomes a real Compass-original candidate.
- **Multi-model review "consolidate for cost" pressure.** Watch for downstream users questioning why both Claude and Codex are needed ("can we just use Claude for everything?"). The hardened AGENTS.md framing + ⚠ comment in agent-handoff.yml should hold the line, but if the question keeps recurring, the structural argument may need promotion to a numbered principle. Empirical CB-1.4 evidence is the load-bearing citation; collect more if the pressure mounts.
- **Codex's review quality drift.** The "Codex outperformed Claude" empirical claim is anchored to a specific point in time. Different-model reviewer logic stays valid regardless of which specific models are involved, but if Codex's review quality regresses materially in future Codex CLI updates, the choice of Codex-as-default in agent-handoff.yml may need reconsideration. Tracked via `compass/roles/reviewer.md` freshness markers + the new Codex CLI freshness window in `compass/scripts/README.md`.

---

### 2026-05-27 — `[role-boundary]` Compass-original + token-usage parser + new `compass/scripts/` directory (v0.3.4)

**Friction:** User asked *"is there a way to capture the tokens used at every role?"* — no per-role token visibility in Compass today. Token tracking is genuinely the AI tool's job (Claude Code, Codex CLI exposes session totals; per-role attribution doesn't exist as a first-class feature). Compass can help by defining a role-boundary protocol and shipping a sample parser, but the accuracy ceiling is bounded by the AI tool's instrumentation.

**Use cases — user said "all of the above":**
- Cost transparency (know what Compass costs to run)
- Role optimization (identify bloated role docs)
- Debugging / explainability (trace why a workflow run was expensive)
- Team reporting (share Compass cost breakdown)

Same captured data supports all four; the parser output needs to be pivotable.

**Investment level — user picked "Protocol + sample parser."** Compass ships both the markers and a reference Python script. Not just protocol-only (would force user to build their own parser); not full AI-tool integration (Claude Code feature-request territory). Middle path: define the convention; ship a working reference; let consumers fork.

**Ownership — user said "it should be the project manager role."** Token usage rollups join PM's portfolio of "make work visible" jobs (`/status`, `/plan`, sprint comms). Light touch this round: PM-doc note + manual parser invocation. No new `/usage` workflow — defer until/if workflow integration becomes load-bearing.

**Change:**
- New `[role-boundary]` Compass-original in `compass/framework/canon.md`. HTML-comment markers shape: `<!-- COMPASS_ROLE_BOUNDARY: <enter|exit> | role=<name> | workflow=<id> | step=<N> -->`. Documentation + parser anchor in one mechanism.
- **New framework directory: `compass/scripts/`.** Convention: single-file, stdlib-only, PM-operable. Justified by token tracking being structurally hard to solve with markdown docs alone. Sibling `README.md` per script for usage.
- **`compass/scripts/token-usage.py`** — single-file Python 3 stdlib parser. Reads Claude Code session log + workflow markdown markers; produces markdown report with per-workflow cost / per-role rollup / per-step breakdown. Default Anthropic Sonnet 4.x pricing; configurable.
- **`compass/scripts/README.md`** — usage docs with accuracy honesty (linear-step assumption, multi-message approximation, user-interrupt sensitivity, pricing assumption).
- `/build` workflow gained markers as first instance — six matched enter/exit pairs across Engineer + Reviewer + Tech Writer phase transitions (Phase 2 / Phase 3 / Phase 4 / Phase 5 / Phase 7).
- `compass/roles/project-manager.md` gained token-usage rollup as a PM responsibility (manual invocation, optional `docs/usage/<session-id>.md` archive).
- `AGENTS.md` Workflow Structure section gained `[role-boundary]` note + brief mention of `compass/scripts/` as new framework directory.
- `compass/templates/workflow-template.md` gained inline commentary on role-boundary markers as optional addition.

**Roadmap shift:** v0.3.3 release notes committed v0.3.4 to **freshness detection** (CI watching external tools). This round prioritizes token tracking; freshness detection bumps to **v0.3.5+**. The freshness-check workflow-side defense from v0.3.3 stands as the user-side defense until detection ships. Roadmap shift named explicitly in canon.md `[freshness-check]` entry, AGENTS.md Workflow Structure note, and v0.3.4 CHANGELOG.

**Files touched (9):** new — `compass/scripts/token-usage.py`, `compass/scripts/README.md`. Edited — `compass/framework/canon.md`, `compass/templates/workflow-template.md`, `compass/workflows/build.md`, `compass/roles/project-manager.md`, `AGENTS.md`, `CHANGELOG.md` (0.3.4), `compass/workflows/improvements.md`.

**Watch for:**
- **Parser accuracy bounds.** Linear-step assumption breaks when Claude executes out of order, when user interrupts mid-step, or when steps span very different message counts (e.g., a one-line role-load step vs. a hundred-message implementation phase). Report's Confidence footer names the heuristics, but consumers may misread the numbers as precise. If team reports start citing parser figures as exact, tighten the Confidence section.
- **Marker drift if workflow steps reorder.** When a workflow is updated (e.g., a step is inserted or renumbered), markers may end up with wrong step numbers. Future candidate: a marker linter script that validates enter/exit balance + step references match the workflow file.
- **PM workflow integration creep.** Light-touch this round (role-doc note + manual invocation). If PM repeatedly runs the parser as part of `/status` or sprint-comms drafting, that's signal to promote to a `/usage` workflow with proper template + skill. Watch for the pattern; don't preemptively build.
- **Pricing drift.** Default `$3/M in, $15/M out` is Anthropic Sonnet 4.x as of 2026-05. Anthropic adjusts pricing periodically; users on other models (Opus, Haiku, future Sonnet versions) need to override. Pricing should probably get the `[freshness-check]` treatment eventually — but defer until staleness bites.
- **Cross-AI-tool support.** Parser is Claude Code specific. Codex CLI session logs have a different format. If Codex sessions need per-role attribution, write a parallel parser (`token-usage-codex.py`) — same protocol, different log parser. Defer until needed.
- **2nd-instance trigger for principle #17.** Per codification rule (≥2-3 applications before promoting to AGENTS.md principle), wait for a 2nd workflow adopting `[role-boundary]`. Likely candidates: `/create-brief` or `/setup-product` (both multi-role). v0.3.x will surface the right next workflow when token-tracking value emerges for it.

**Meta-observation — `[role-boundary]` is the 4th Compass-original shape.** Catalog now spans: **enforcement** (cite-or-mark-n/a · refuse-escalate · soft-spec-hardening — what the workflow REQUIRES) · **interaction** (elicitation-with-options — how the workflow ASKS) · **freshness** (freshness-check — how the workflow STAYS CURRENT) · **observability** (role-boundary — how the workflow EXPOSES STRUCTURE). Worth watching whether a 5th shape surfaces as the framework grows. The split between "what the framework demands" (enforcement) vs. "how the framework makes itself usable" (interaction / freshness / observability) is becoming the load-bearing organization axis of the Compass-originals.

**Bridge progress meta:** The v0.3 series is rapidly accumulating Compass-original patterns. v0.3.1 = Access & Data Posture (new section in foundation-product). v0.3.2 = elicitation-with-options. v0.3.3 = freshness-check. v0.3.4 = role-boundary. **One Compass-original per session has held as a sustainable cadence.** Worth a retro after v0.3.5 lands (per the `/retro` every-5-improvements cadence; v0.3.1–v0.3.5 will be batch #5 if we count carefully — verify via the retro counter when next retro fires).

---

### 2026-05-27 — `[freshness-check]` Compass-original + Codex format as first application (v0.3.3, pull-bridge round 1)

**Friction:** User ran `/build` → Codex review failed because **Codex's review format had changed** and Compass's docs about the format had gone stale. The workflow's parser expected the old format; new format didn't match; review silently broke. This is **the second time external-tool drift bit a workflow** (first was aura-app's various library version mismatches surfaced in v0.2.5; that round patched specific things but didn't establish a pattern).

**Diagnosis — class problem, not Codex-specific.** Same drift surface hits:
- **MCP connector APIs** (Sentry / GitHub / Linear / Atlassian) — schemas evolve; `/scan`, `/measure`, `/status` MCP calls go stale
- **Library / framework versions** (Expo SDK, Next.js, React, library options in `/setup-foundation-architecture` elicitation) — already flagged in v0.3.2 watch-for
- **Vendor capability claims** (cloud SDK options, regional availability) — `/scan` PROD_READY-09 catches some but not formats
- **Cloud platform conventions** (Vercel patterns, AWS service options) — drift silently

Compass had **no structural mechanism** to catch stale external references. The "Source freshness" confidence signal in `/scan` (scanner.md) is spiritually right but applies only to per-bet artifacts, not to Compass's own docs that reference external tools.

**User direction:** *"compass should always check for latest changes and update the user or the doc … it should ideally be a push from compass to the repo owners."* Push is the right long-term shape but requires infrastructure Compass doesn't have today:
1. **Detection** — something watches external tools for changes
2. **Distribution** — something delivers updates to consuming repos (today: repos copy `compass/` + `.claude/` at setup; no update channel)

**Path picked (Path A — pull-bridge):**
- **v0.3.3 (this round):** workflow-side check. Workflow reads `last_verified` date on Compass doc; refuses if stale. Immediate unblock.
- **v0.3.4:** framework-side detection. CI on Compass repo watches Codex/MCP/library/Vercel changelogs; auto-updates Compass docs + bumps `last_verified`.
- **v0.4+:** distribution. Compass framework updates auto-propagate to consuming repos as PRs (per user pick: *"pushed doc updates"*).

Each step delivers value; final state is the push model the user described.

**Change:**
- New `[freshness-check]` entry in `compass/framework/canon.md` (Compass-original). Pattern: docs that reference external tools get `last_verified` + `freshness_window_days` + `external_source` frontmatter; workflows add a Precondition that refuses if stale. Missing `last_verified` = infinitely stale.
- `compass/roles/reviewer.md` gained the freshness frontmatter (last_verified: 2026-05-27, freshness_window_days: 30, external_source: OpenAI Codex GitHub). Existing "Review output format" section renamed to **"Expected Codex output shape"** with explicit field-by-field expectations — gives `[freshness-check]` something semantically verifiable in future rounds.
- `compass/workflows/build.md` Phase 5 gained step 12a — freshness-check Precondition. Before Codex review, read reviewer.md frontmatter; refuse if stale with pointer to external source + file to update. Per Principle #16 — refuse + escalate.
- `AGENTS.md` Workflow Structure section gained note about `[freshness-check]` as the second Compass-original interaction-class pattern (after `[elicitation-with-options]`).

**Files touched (6):** `compass/framework/canon.md`, `compass/roles/reviewer.md`, `compass/workflows/build.md`, `AGENTS.md`, `CHANGELOG.md` (0.3.3), `compass/workflows/improvements.md`.

**Watch for:**
- **The freshness markers themselves go stale.** Recursive problem — `last_verified: 2026-05-27` on reviewer.md is only as fresh as the user's discipline to update it after manually verifying against `external_source`. v0.3.4 detection solves this systematically; v0.3.3 relies on user discipline at re-verification time.
- **Threshold tuning.** 30 days default for fast-moving tools (Codex). If actual Codex format changes are less frequent, 30 days = unnecessary refusal noise. If more frequent, 30 days = misses drift between checks. Tune based on actual drift cadence once observed across 2-3 verifications.
- **Date-only check is mechanical but blind.** Even within freshness window, the format could have changed and we wouldn't know. v0.3.4 detection (semantic verification by watching external source) is the real fix; v0.3.3 just gates on date, which is the cheapest mechanical check.
- **Refusal fatigue.** If `/build` refuses every 30 days waiting for re-verification, that's friction. The mitigation is v0.3.4 detection — once CI auto-bumps `last_verified` when nothing has changed, the refusal only fires when actual drift is detected. Until then, the user pays the manual-verify cost periodically.
- **Backfill burden across other Compass docs.** Every doc that references external tools eventually needs the markers. v0.3.3 backfills only reviewer.md. Future sessions backfill MCP / library / Vercel / cloud-platform references one at a time as each becomes a load-bearing concern.
- **2nd-instance trigger for principle #17.** Per codification rule (≥2 applications before promoting), the next workflow adopting `[freshness-check]` (likely an MCP-dependent workflow like `/scan` or `/measure` with API schema staleness) makes this an AGENTS.md cross-cutting principle.

**Meta-observation:** `[freshness-check]` is the **second interaction-class Compass-original** (after `[elicitation-with-options]`). Both surface a class of failure (decision rationalization; format drift) and provide structural defense (curated options; date-gated precondition). The framework's Compass-original catalog now spans three shapes: **enforcement** (cite-or-mark-n/a, refuse-escalate, soft-spec-hardening — what the workflow REQUIRES), **interaction** (elicitation-with-options — how the workflow ASKS), and **freshness** (freshness-check — how the workflow STAYS CURRENT). Worth watching whether a 4th shape surfaces (e.g., capture / validation / observation) as the framework grows.

**Bridge progress meta:** v0.3.3 is **round 1 of 3** toward the push model. The bridge framing is documented in canon.md and CHANGELOG so future-Compass (and future contributors) know where v0.3.4 / v0.4 are heading. This is the first time Compass has shipped a multi-version roadmap inline with the first round — worth noting as a deliberate communication pattern.

---

### 2026-05-27 — `/setup-foundation-architecture` hardened + elicitation-with-options pattern (v0.3.2)

**Friction / trigger:** Second workflow translation in the v0.3 cycle per cadence. User picked `/setup-foundation-architecture` (had been pending since v0.3.0-alpha established the template). Additionally, user requested NEW behavior beyond just hardening: **interactive elicitation** — workflow should ASK the user about each architectural decision, present 3 widely-used product/tool options, and let user pick. Replaces the v0.2.x pattern of "draft with smart defaults, ask user to approve" (which the agent in practice mostly skipped — same soft-spec-rationalization shape the framework keeps catching).

**Design picks (locked via AskUserQuestion):**
- **Granularity:** grouped by stack layer — 4 elicitations (frontend / backend / data / ops) rather than all 13 stack rows individually (too verbose) or constraint-first (too opinionated).
- **Curation context:** hybrid — first decision (anchor: primary language + deployment model) is static (same 3 options); subsequent decisions cascade (options biased by prior picks for coherent stacks).
- **Reusability:** add to `canon.md` as Compass-original `[elicitation-with-options]`. Future workflows can adopt (likely 2nd instance: retroactive `/setup-product` enhancement for the v0.3.1 Access & Data Posture fields).

**Deliberate precedent break — `[elicitation-with-options]` is a behavior change.** v0.3.0-alpha set the rule: workflow hardening is "PRESERVE all existing behavior." v0.3.2 deliberately violates that for the elicitation pattern (per explicit user direction). **Future translators must not quietly assume the preserve-behavior rule still binds across all hardenings — it's a default that can be overridden with explicit user direction + documented violation.** This is the first such override in the v0.3 cycle.

**Change:**
- `compass/framework/canon.md` gained 3 entries:
  - New top-level section **Architecture frameworks** with `[well-architected]` (AWS, 2015 + sustainability 2021) and `[evolutionary-architecture]` (Ford / Parsons / Kua, 2017).
  - Compass-originals section gained `[elicitation-with-options]` — first Compass-original interaction pattern (vs. prior Compass-originals which were all enforcement-shaped: cite-or-mark-n/a, refuse-escalate, soft-spec-hardening). Pattern: static anchor + cascading subsequent decisions, each 3 options + "Other (specify)," each pick captured with rationale + per-pillar implication.
- `compass/workflows/setup-foundation-architecture.md` fully translated to v0.3 template: gate/work/postcondition triplets, framework grounding section, workflow-level Preconditions, 16 Phase A steps + 5 Phase B steps (was 12 + 5 in v0.2.x). All v0.1.11–v0.2.7 behavior preserved: Phase A/B HITL gate split, foundational data model derived before stack picks, bet-arch deviation gate reference, multi-target canary, ADR / Amendments pattern.
- **NEW elicitation steps 8-12:** anchor (primary language + deployment model — static 3 options) + 4 cascading stack-layer elicitations (frontend / backend / data / ops — biased by prior picks). Step 10 (backend) elicitation's auth model **derives from foundation-product Access & Data Posture (v0.3.1)**; divergence triggers refuse + escalate. Step 11 (data) **cites Foundational Data Model**; DB pick that ignores entity shape fails. Per-pillar implication captured per step (replaces v0.1.11's separate pillar-scoring step; pillar scoring now baked into each elicitation step's Postcondition).
- `compass/templates/foundation-architecture.md` gained **"Stack picks (elicited)"** section between Foundational Data Model and Stack — captures anchor + 4 layer picks.
- `compass/templates/workflow-template.md` gained inline commentary on elicitation steps as a valid Steps pattern.
- `AGENTS.md` "Workflow structure" section gained note about `[elicitation-with-options]` as a named Compass-original (pointer to canon entry).

**Files touched (7):** `compass/framework/canon.md`, `compass/workflows/setup-foundation-architecture.md`, `compass/templates/foundation-architecture.md`, `compass/templates/workflow-template.md`, `AGENTS.md`, `CHANGELOG.md` (0.3.2), `compass/workflows/improvements.md`.

**Watch for:**
- **Elicitation depth fatigue.** 5 elicitation steps (anchor + 4 layers) is a lot of user back-and-forth. If real `/setup-foundation-architecture` runs feel slow or users skip-skip-skip through them, the cascading could compress (e.g., one "stack picks" Q&A session that walks through all 5 in sequence with shortcuts for users who have strong preferences). Defer changes until ≥2 real runs.
- **Anchor=Other handling.** When user picks "Other (specify)" for the anchor, downstream cascades fall back to static layer options. If this fallback feels inadequate (e.g., user has a coherent custom stack but layer options don't fit), tighten the fallback rules. May surface as a v0.3.3 candidate after first real "Other" anchor.
- **Option curation freshness.** The 3 options per anchor / per layer are listed in the workflow file as examples. They'll go stale as the tooling landscape evolves (Vite vs. Turbopack vs. Rspack churns; serverless vs. edge vs. containers shifts). Eventually the elicitation step should reference canon.md entries for each option rather than hard-coding tool names in the workflow. Defer until staleness bites — likely 12-18 months out at current churn.
- **2nd instance trigger for principle #17.** When a 2nd workflow adopts `[elicitation-with-options]`, codify as AGENTS.md cross-cutting principle. Likely candidate: retroactive enhancement of `/setup-product` Access & Data Posture (v0.3.1) — 3 fields could use the elicitation pattern for closed-enum picks. Worth doing if/when the user surfaces friction with the current static-list approach.
- **Preserve-behavior rule erosion.** v0.3.2 set the precedent that hardening can include deliberate behavior changes per explicit user direction. Future translators may use this as a loophole ("the user wanted X" → behavior creeps in alongside translation). Counter: the rule is "structural-only translation by default; behavior changes require explicit user direction + named in improvements.md as a precedent break." If multiple future hardenings stack precedent breaks, consider tightening to "behavior changes happen in separate patches, not bundled with hardening."

**Meta-observation — pattern type:** `[elicitation-with-options]` is the **first Compass-original interaction pattern** (vs. prior Compass-originals which were all enforcement-shaped). The framework's Compass-original catalog now spans two shapes: enforcement (cite-or-mark-n/a, refuse-escalate, soft-spec-hardening — what the workflow REQUIRES) and interaction (elicitation-with-options — how the workflow ASKS). Worth watching whether this split surfaces a 3rd shape (e.g., capture patterns, validation patterns) as the framework grows.

**Length / density check** (per v0.3.0-alpha recalibration): hardened `/setup-foundation-architecture` is ~370 lines vs ~156 in v0.2.x = ~2.4x. Load-bearing density: ~80 items (16 Phase A steps × ~3 gates each + Phase B steps + Verification + Framework grounding citations + named anti-patterns) / 370 lines = **1 per 4.6 lines**. Original was ~30 / 156 = **1 per 5.2 lines**. **Density improved** (denser is better) — adding load-bearing elicitation content and framework grounding raised density, confirming the v0.3.0-alpha recalibration thesis: length grows with constraint, not ceremony.

---

### 2026-05-27 — Access & Data Posture surfaced at foundation-product layer (v0.3.1)

**Friction:** User ran `/setup-foundation-architecture` on aura-app and observed: **the workflow didn't ask about authentication and scaffolded nothing auth-related.** Even though auth IS in the Stack table (row 8: `Auth model | <session / JWT / OAuth> | <hard>`) and IS named in step 7's stack-row enumeration, **it's one bullet among 13 with no special weight** — agent rationally treated it like contracts format. Classic Principle #14: soft-spec burial → agent rationalization → load-bearing concern slips through.

**Explore-agent triage confirmed the gap is upstream at the foundation-product layer**, not downstream at architecture:
- `compass/templates/foundation-product.md` (114 lines) — no access/auth/data section anywhere. "Personas" doesn't ask about authentication state. "Defensibility/Moat → Regulatory" is competitive moat, not access posture.
- `compass/templates/brief.md` (116 lines) — same blank.
- `compass/workflows/setup-product.md` Verification — **zero gates on auth/identity.**
- `compass/workflows/setup-foundation-architecture.md` "Identity strategy" is about **DB primary key type (UUID v7 / ULID / sequential)** — not access posture. I previously mis-attributed it as auth-adjacent; it isn't.
- **16 AGENTS.md principles, none names this.** Zero prior improvements entries. **First time being named in the framework's history.**

**User direction (after a course-correct from over-scoped initial plan):**
- "Looks a foundational issue" → treat at framework level, not just template tweak.
- "As simple as possible" → tight scope, closed enums, n/a-with-reason allowed.
- "Every product brief should include authentication" → applies broadly (but defer `brief.md` to v0.3.2 per "one step at a time").
- "Lets get create product right" → `/setup-product` only this round.
- Picked **3 fields** (auth posture + data sensitivity + regulatory regime); picked **mandatory elicitation step** (workflow asks; doesn't trust agent to remember).

**Change:**
- **New "Access & Data Posture" section in `compass/templates/foundation-product.md`**, placed after Personas. 3 mandatory fields with closed enums:
  - Auth posture: anonymous · registered · authenticated · MFA-required · regulated-identity
  - Data sensitivity: none · public · PII · sensitive · regulated
  - Regulatory regime: none · GDPR · HIPAA · SOC 2 · PCI DSS · sector-specific · combination
  - `n/a — <reason>` valid only for genuinely non-applicable cases (e.g., internal build tooling with no users).
- **`/setup-product` Step 5 gained explicit elicitation sub-bullet.** Workflow conversationally asks the user the 3 questions during drafting (not just "populate the section silently"). Per Principle #14 — explicit elicitation closes the rationalization surface.
- **Step 5 Postcondition updated** to require the section is populated with values or `n/a — <reason>`.
- **New Verification gate item** in `/setup-product`: section populated, all 3 fields with value or `n/a — <reason>`; HITL gate blocks otherwise. References Principle #15 (cite-or-mark-n/a) + Principle #14 (named explicitly because foundational-product bets have historically failed to surface auth — the v0.3.1 trigger).

**Files touched (4):** `compass/templates/foundation-product.md`, `compass/workflows/setup-product.md`, `CHANGELOG.md` (0.3.1), `compass/workflows/improvements.md`. **Tight scope.**

**Watch for:**
- **Whether the `n/a` escape valve gets abused.** Backend-only / internal-tooling projects legitimately need it. If `n/a — internal` becomes the default answer for foundational products that DO have user-facing components, closed enums need tightening or workflow needs sharper elicitation language.
- **2nd-instance trigger for Principle #17.** When `/create-brief` gets the same treatment in v0.3.2 (every feature/OKR/tech-debt bet declares Access & Data), promote to AGENTS.md cross-cutting principle #17: *"Every bet declares access & data posture."* Currently 1 instance; codification rule says wait for ≥2-3.
- **Decide-before-derive flow in v0.3.2.** `/setup-foundation-architecture` auth promotion should **read the foundational product Access & Data Posture as input** — derive auth model from it, don't redefine. Without that link, the architecture decision is unmoored from the product decision and the gap returns at a different layer.
- **Agent over-scope tendency (meta-observation).** This round I initially over-scoped the plan: first pass was 7 files touching product + brief + architecture in one patch. User course-corrected: *"one step at a time. Lets get create product right."* Same shortcut shape as the soft-spec-rationalization failure mode the framework keeps catching — even the meta-architect (Claude on Compass) defaults to "do it all at once" when a clean structural fix is visible. **Recursive Principle #14 again; honor the slow-pace commitment.**
- **No new AGENTS.md principle this round.** Pattern needs 2nd instance (brief.md treatment) to satisfy codification rule. Codify in v0.3.2.

**Meta-observation:** v0.3.1 is the smallest patch in the v0.3 cycle (4 files; ~10 lines of new content per file). **Deliberate.** Validates the "one step at a time" cadence as a real discipline, not just stated intention. Next aura-app `/setup-product` run should surface auth as a foundational question — that's the validation criterion. Architecture-layer auth derivation lands separately in v0.3.2.

---

### 2026-05-26 — Workflow hardening template established + `/setup-product` translated (v0.3.0-alpha part 2)

**Goal:** Validate that the v0.3 gate/work/postcondition template can express a real workflow without ceremony bloat or behavior change. Pick `/setup-product` first — already the most disciplined workflow (had Verification gate from v0.1.9, named anti-patterns inline). Low translation risk → ideal for validating template on the easy case before harder workflows translate.

**What was done:**
- `compass/templates/workflow-template.md` created with all required sections + inline HTML commentary explaining each section's purpose (so future translators inherit intent).
- `compass/workflows/setup-product.md` translated step-by-step to the new template.
- Diff against v0.2.8 setup-product confirmed: **same 9 steps, same order, same artifacts, same HITL gate, same refusal cases. No behavior changes.** Implicit preconditions made explicit (the "source material required" check was inline in old Step 4; now in workflow-level Preconditions with refuse-and-redirect). Missing postconditions added (each step now has a mechanically-checkable output, not just the v0.1.9 Verification gate at end). Cross-cutting principle references in Verification are specific — each cite points at exactly what to enforce.
- `AGENTS.md` gained a "Workflow structure" section explaining the gate/work/postcondition pattern and pointing at the template.

**What the translation surfaced (template-validation findings):**

1. **Hardened length: 149 lines vs original 72 = 2.07x.** Just over the 2x hard-fail threshold the validation criteria called out. The template adds ~30 lines of fixed structural overhead per workflow (3-line triplets per step × 9 steps + new Roles/Migration/Output-contract/Anti-patterns sections + principle-referenced Verification expansion). **Fixed overhead = short workflows blow the budget; longer workflows likely fit.** /setup-product is on the shorter end of the workflow surface; /build, /create-brief, /scan are longer (90-150 lines original) and will land in much better ratios.

2. **Triplet structure: mostly natural, two friction spots.**
   - **Context-loading steps (Step 2 "Load PM role", Step 9 "Load PM role for status update")** resist clean triplet separation. The "Work" is "load this file as active context"; the "Postcondition" is "Claude understands the role" — trusted, not file-verifiable. Triplet ceremony for these steps adds 5 lines for what was a 1-line bullet. Worth tolerating (consistency wins) but a candidate for a **lighter "context-load" sub-pattern** in v0.3.0-beta.
   - **Optional/config-gated steps (Step 7 "Mirror to Confluence/Jira")** — the Postcondition needs to handle both "epic exists" and "skip logged" cases. Triplet handled it cleanly but reads slightly clunky.

3. **Cross-cutting principle references: signal, not noise — when scoped specifically.** The Verification items that reference #14, #15, #16 by number point at the exact output (e.g., "Per Principle #15 — 6-category Researcher framework: remaining 3 categories cited or n/a"). That's useful — future translators reading the workflow understand WHY the gate is mechanical. If we instead wrote "Verification per Principles #14, #15, #16" without specifics, it would be ceremony — and we'd lose the value. **Rule for translators: cite the principle AND name the specific output it enforces. No bare citations.**

**Template adjustments needed (v0.3.0-beta candidates):**

- **Shorten triplet ceremony for trivial steps.** Consider a single-line variant for context-loading steps: `### N. <Title> — Pre: <one-liner>. Work: <one-liner>. Post: <one-liner>.` Reserve the full triplet block for steps with non-trivial Work. Would save ~10-15 lines per short workflow. Defer until 2nd workflow translation confirms the friction is real (`/create-brief` likely the next translation).
- **Lighter Migration section for first hardenings.** Current Migration section is 6 lines for /setup-product. After 5+ workflows have been hardened, the convention is established and Migration sections can be shorter ("Translated per v0.3.0-alpha; no behavior change" + bullet list of changes). Don't over-trim while the convention is still new.
- **Decide whether `Output summary contract` is per-workflow or framework-wide.** It's identical across workflows (per principle #12). Could become a one-liner pointing at AGENTS.md #12 instead of repeating the contract. Defer — keep redundancy until pattern stabilizes.

**Diff confirmation (behavior preservation):**

| Aspect | Before (v0.2.x) | After (v0.3.0-alpha) | Changed? |
|---|---|---|---|
| Step count | 9 numbered Process steps | 9 numbered Steps | No |
| Step order | Check state → PM → Researcher → Source → Draft → DRI → Mirror → HITL → status update | identical | No |
| Roles invoked | PM, Researcher, Project Manager | PM, Researcher, Project Manager | No |
| Artifacts produced | `product.md`, optional `research.md`, `status.md` update | identical | No |
| HITL gate | After Verification passes | After Verification passes | No |
| Refusal cases | 2 (proposed-pending; no source) | Same 2, now workflow-level Preconditions | Structural only |
| Verification items | 7 | 12 (each step's postcondition mirrored + invariants + principle cites) | Structural; same enforcement, more checks made explicit |
| Named anti-patterns | Inline in Step 3 prose | Notes → Anti-patterns section | Surfaced explicitly |

**Pattern:** First v0.3 workflow hardened. Establishes the template; surfaces ergonomics friction; doesn't expand behavior. One workflow at a time per the slow-pace commitment.

**Next:** Wait. Don't translate the next workflow until v0.3.0-beta ships template adjustments based on the findings above. Second translation (likely `/create-brief`) pressure-tests the template against a less-disciplined workflow — that's where the real ergonomics signal comes from.

---

**ADDENDUM — 2026-05-27: framework grounding section added; budget recalibrated to density.**

After the initial validation above, the spec added a required **Framework grounding** section between Header and Purpose. Workflows now cite the canonical frameworks they operationalize (industry standards, books, Compass-originals, cross-cutting principles), with citations resolving to a new reference doc `compass/framework/canon.md`. For `/setup-product`: Working Backwards · Lean MVP · Continuous Discovery · JTBD · Porter's Five Forces · Helmer 7 Powers (9-type extension) · Blue Ocean · Shape Up · Helmer bet portfolio · Pyramid Principle · Stripe 2-page · Amazon 6-page · OKRs · North Star · plus Compass-originals (cite-or-mark-n/a, refuse + escalate, soft-spec hardening).

**This pushed `/setup-product` to 161 lines (2.24x original), well past the original "2x hard fail" threshold.** That triggered an explicit recalibration of the hardening budget:

- **Old heuristic (rejected):** "hardened workflow ≤ 40% longer; 2x = hard fail." A raw-length proxy that didn't survive first contact. Penalized templates for adding load-bearing content (Framework grounding) the same as it penalized ceremony.
- **New measure (adopted):** **load-bearing density** — count mechanically-checkable constraints, named conventions, auditable framework citations, principle-scoped Verification items per line. The check: **does each line earn its place?** Hardened `/setup-product` density = ~50 load-bearing items / 161 lines = **1 per 3.2 lines**. Original = ~20 / 72 = 1 per 3.6 lines. **Density rose, not fell** — hardening was net-additive to constraint, not bloat.

**Why this re-calibration matters more than the budget bust it resolves:**

- **Goodhart-resilient measure.** Counting "load-bearing items" instead of "lines" makes the metric track what we actually care about (constraint density) rather than a proxy (file size). Goodhart's law still applies — translators could pad Verification with non-load-bearing checkpoints to inflate density — but density is at least pointing at the right thing.
- **Recursive Principle #14 lens applies to the framework's own metrics.** The original "2x lines" budget was a soft heuristic that, when contact with reality showed it was wrong, would have been rationalized away ("eh, 2.06x is *basically* 2x"). Replacing it with an explicit measure tied to load-bearing-per-line removes the interpretive room.
- **Framework grounding becomes free in the new measure.** Each cited framework counts as a load-bearing item (auditable lineage anchors a gate's intent). The 15+ citations in `/setup-product` add ~30 lines AND ~15 load-bearing items, so density stays roughly stable.

**v0.3.0-beta candidates still standing** (not invalidated by re-calibration; they're ergonomics improvements that also help density):

- **Lighter triplets for context-loading steps** — saves lines without losing constraints, so density goes UP. Worth doing.
- **Output summary contract collapsed to one-line pointer at AGENTS.md #12** — same. Worth doing.
- **Citations as cross-doc references** is now MOOT — they're already cross-doc references (short-form → `canon.md`). The compression argument loses force; the auditability argument was the real reason to do it.

**What this means for `/build`, `/create-brief`, and future hardenings:** stop staring at line counts. Run the density check after translation. If density holds (≥ original or improved), the hardening was structurally sound regardless of length. If density drops, the template is adding ceremony — that's the real signal for template adjustment.

**Pattern observation:** the re-calibration is itself an application of Principle #14 to framework measurement. Soft metric ("budget is ~40% longer, 2x is too much") got rationalized away on first contact; replaced with a constraint-shaped measure (load-bearing density) that's harder to hand-wave. Same recipe as the workflow-level patches: name the failure mode (raw-length proxy fails for load-bearing growth) + make the new constraint mechanically defined (count items, divide by lines) + name the anti-pattern (Goodhart-style padding) inline so future framework-Architects inherit the vocabulary.

---

### 2026-05-26 — `/advance` deprecated (v0.3.0-alpha part 1) — first action on a retro-surfaced drift signal

**Friction:** Retro #003 (shipped hours earlier in v0.2.8) flagged `/advance: 0 uses in aura-app over 4 days of active dev` as a drift signal. The framework had been over-engineering a "canonical phase advance" command that real users don't invoke — phase transitions happen naturally via status-field flips (`proposed` → `approved` → `in-build` → `shipped`), and the elaborate auto-trigger chain we built (`/advance` → `/plan` → `/scan` → `/dashboard`) was load-bearing in the spec but irrelevant in practice.

**This is itself an instance of Principle #14 applied recursively to framework design.** The framework designer (me, earlier) rationalized that a canonical advance command was needed — that "users will want to advance phases through a single ceremony." The interpretive room was in the framework's *own* spec for itself. Reality showed users don't want that ceremony; they just flip statuses. Same soft-spec → rationalization → reality-collision pattern, just at the framework-design layer instead of the workflow-execution layer.

The retro cadence's promised lag-shrinking worked on its first try: drift signal surfaced in retro #003 → acted on in v0.3.0 the same day. **Convention-discovery lag = hours, not 17 improvements.**

**Change:**

*The workflow:*
- `compass/workflows/advance.md` — DEPRECATED notice at top + migration table + historical-record process preserved below. Skill kept registered (don't fail silently); on invocation, the workflow prints the migration table and does nothing else.
- `.claude/skills/advance/SKILL.md` — description updated to mark deprecated + migration pointer.

*Auto-chain references cleaned from active surface:*
- `compass/workflows/plan.md` — removed "Auto-triggered by /advance"; replaced "Auto-trigger contract" section with "Freshness" (manual + cron + `/status` flags staleness).
- `compass/workflows/scan.md` — removed "Auto-invoked by /advance"; kept `/build` phase-boundary auto-invocation (independent of /advance, stands on its own).
- `compass/workflows/dashboard.md` — removed transitive-via-/plan-from-/advance trigger entry; kept the 4 writer auto-triggers.
- `compass/workflows/status.md` — removed "or /advance (which auto-runs /plan)" suggestion.
- `compass/workflows/create-bet-portfolio.md` — rephrased plan-refresh-on-/advance to manual + cron.
- `compass/workflows/build.md` — rephrased "matching /advance behavior" → "matching the scanner's strict-mode block semantics."
- `compass/roles/project-manager.md` — removed auto-trigger-from-/advance annotations on `/plan` and output artifacts.
- `compass/roles/scanner.md` — removed /advance from "When you play this role" list.
- `compass/templates/scan-report.md`, `compass/templates/brief.md`, `compass/templates/plan.md` — removed "Auto-invoked by /advance" / "Auto-triggered by /advance" footers.
- `.claude/skills/plan/SKILL.md` + `.claude/skills/scan/SKILL.md` — descriptions updated.

*Canonical lists:*
- `AGENTS.md` workflow table: 18 → 17 (removed /advance row).
- `CLAUDE.md` commands list: removed /advance.
- `README.md` flow diagram: removed Navigate bucket (whose only member was /advance); now 4 buckets (Bootstrap / Plan / Execute / Observe). Added explanatory note: phase transitions are direct status-field flips, no canonical advance command.
- `SETUP.md`: removed /advance from "Anytime" section + rephrased the v0.1.14 plan-auto-refresh sentence.

**Files touched:** 21 — `compass/workflows/advance.md`, `.claude/skills/advance/SKILL.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `SETUP.md`, `compass/workflows/plan.md`, `compass/workflows/scan.md`, `compass/workflows/dashboard.md`, `compass/workflows/status.md`, `compass/workflows/create-bet-portfolio.md`, `compass/workflows/build.md`, `compass/roles/project-manager.md`, `compass/roles/scanner.md`, `compass/templates/scan-report.md`, `compass/templates/brief.md`, `compass/templates/plan.md`, `.claude/skills/plan/SKILL.md`, `.claude/skills/scan/SKILL.md`, `CHANGELOG.md` (0.3.0), `compass/workflows/improvements.md`.

**Files NOT touched** (deliberately):
- All 3 retro archives — they reference /advance as an active workflow, accurate as-of-write; immutability preserved.
- Historical CHANGELOG entries (v0.1.14 through v0.2.8) — historical record; deprecation lives in the new v0.3.0 entry, not retroactive edits.
- Historical improvements.md entries — same reason.

**What we kept (independent of /advance):**
- `/build` phase-boundary auto-invocation of `/scan` — catches missing production-readiness work before story is treated as shipped.
- `/dashboard` auto-refresh from `/scan` / `/plan` / `/metrics` / `/status` — writers refresh their own browser view; doesn't need orchestrator.
- Cron-driven `/scan` per `compass/config.yaml`.
- The `blocking_advance` field on scan reports + `scanner.per_phase` config — informational signal users consume when deciding to flip status fields.

**What we explicitly did NOT replace /advance with:**
- No new "canonical phase advance" command. The drift-signal insight was that this command wasn't needed; replacing it with a renamed equivalent would re-introduce the same loophole.
- No new auto-trigger from `/create-brief`, `/create-bet-architecture`, `/create-story`, `/build` to `/plan`. The /plan auto-refresh story is now: manual + cron + (existing) `/build` phase boundaries. If /plan going stale becomes a real problem, that's a future patch — not bundled with deprecation.
- No new role.

**Watch for (improvements #17-20):**

- **Are users actually flipping status fields directly?** The deprecation assumes users do this naturally. If they don't (e.g., a future user complains "I don't know what status to flip to"), we may need a thin "status-transition helper" doc — but NOT a /advance redux. Watch for the request shape.
- **Does the plan go stale without /advance's auto-trigger?** Cron + manual + /build phase boundaries should cover it. If `/status` keeps flagging staleness during active development, consider auto-firing /plan from /build PR-merge step (story-shipped event). Don't pre-add; wait for evidence.
- **Does `/dashboard` go stale?** Should not — the 4 writer auto-triggers are intact. If users observe staleness, the failure mode is that the writers themselves aren't being invoked, not that the auto-chain is missing.
- **Recursive Principle #14 application** — Claude-as-framework-designer fell into the soft-spec trap once (/advance). Watch for other framework-level rationalizations in the next batch. Likely candidates: any "auto-run" or "always engages" language describing framework mechanics that doesn't have downstream evidence of use. The retro pattern catches this; trust the process.

**Meta-observation:** The first action a `/retro` produced was deprecating a workflow the retro itself surfaced as drifted. That's the cadence working as designed — and it's deeply pleasing structurally: the framework's first retro-driven decision was *to remove framework surface area*. Most patches add; this one subtracted. Subtractive patches are how frameworks stay sharp.

---

### 2026-05-26 — `/retro` cadence + 3 cross-cutting principles codified from 3-retro backfill (v0.2.8)

**Friction:** User crystallized the single most-recurring failure mode across the framework's 15 prior improvements:

> *"Soft spec → AI rationalization → fix is hardening the spec. Anywhere an AI agent has interpretive room, it will exercise judgment that diverges from intent. Constraints that are 'implied,' 'obvious,' or 'best practice' get rationalized away under load. The fix is never 'tell the AI to be better' — it's explicit constraint + mechanical verification gate + named anti-pattern in the workflow file."*

Validating against the 15 improvements: **~11 of 15 patches fit this exact shape**, and 8+ of those were the same recipe applied to different rationalization surfaces. The pattern was visible by retro #001 (3 instances by improvement #5) but not formally codified until retro #003 reviewed it explicitly. **Convention-discovery lag: ~17 improvements** between "pattern visible" and "pattern named in AGENTS.md."

The user also proposed the meta-defense: **retros every 5 improvements** to surface recurring patterns earlier than the natural codification rhythm.

**Change:**

*New workflow + skill + template:*
- `compass/workflows/retro.md` — fires every 5 improvements logged in `improvements.md`. Reports patterns surfaced, recurring anti-patterns (soft-spec rationalization surfaces), convention candidates, drift signals, watch-for list. **Reports — does not prescribe.** No HITL gate.
- `.claude/skills/retro/SKILL.md` — skill stub.
- `compass/templates/retro.md` — frontmatter (`period_start`, `period_end`, `improvement_count`, `status: archive`). Sections: Improvements / Common patterns (positive) / Recurring anti-patterns (negative) / Convention candidates / Drift signals / Trigger-origin analysis / Watch-for list / Meta-observations.
- `compass/workflows/retros/` directory convention — archived retros live here, immutable once written.

*Backfilled retros (3) — covers improvements 1-15 retroactively:*
- **Retro #001** (v0.1.8 → v0.1.12) — surfaced N-category + refuse-escalate + soft-spec-recipe as convention-ready by improvement #5.
- **Retro #002** (v0.1.13 → v0.2.2) — surfaced `status: living` + state-detection-table + auto-trigger-chain conventions. Major capability-expansion phase.
- **Retro #003** (v0.2.3 → v0.2.7) — confirmed the soft-spec-rationalization pattern at 18+ cumulative instances. Identified `/advance: 0 uses` drift signal from aura-app. Confirmed trigger-origin concentration risk (all 5 from aura-app).

*Three cross-cutting principles codified in AGENTS.md (now 16 principles, was 13):*
- **Principle #14 (foundational): Soft spec → AI rationalization is a vulnerability surface, not flexibility.** User's verbatim formulation. Every load-bearing constraint requires explicit imperative language + mechanical verification gate + named anti-pattern. This is the foundational principle that #15 and #16 instantiate.
- **Principle #15: N-category cite-or-mark-n/a enforcement** for structured consultation. 5+ instances.
- **Principle #16: Refuse + escalate to upstream artifact.** 5+ instances.

*Wiring:*
- AGENTS.md workflow count: 17 → 18.
- `improvements.md` header now tracks retro cadence + next-retro-fires-after counter.

**Files touched:** new — `compass/workflows/retro.md`, `compass/templates/retro.md`, `.claude/skills/retro/SKILL.md`, 3 retro archives in `compass/workflows/retros/`. Edited — `AGENTS.md` (3 new principles + workflow table), `compass/workflows/improvements.md` (header + this entry), `CHANGELOG.md` (0.2.8).

**Watch for (next 5 improvements, #16-20):**

- **`/advance: 0 uses` investigation** — retro #003 flagged this drift signal. Either the auto-trigger chain is too heavy mid-build, or phase transitions are happening implicitly. Surface in the next aura-app session: "why aren't you running /advance?"
- **Trigger-origin diversification** — all v0.2.x improvements came from aura-app. Even one improvement from a different project would meaningfully de-risk over-fitting.
- **6th instance of N-category** would further validate Principle #15. Likely candidates: a Designer or UX Writer role gaining a structured framework.
- **Agent-miscategorization 2nd instance** — Claude (the meta-architect) fell into the soft-spec trap once during v0.2.6 triage. If it recurs, codify the "structural gap underneath symptoms first" heuristic explicitly.
- **`/retro` itself meeting reality.** Retros #001-003 were backfilled; the first *live* retro fires after improvement #20. Does the workflow as-written produce useful retros when run against fresh entries, or is the template still under-specified?
- **Convention-discovery lag should shrink dramatically** — patterns surfacing at instance #3 in a retro should land in AGENTS.md by the next minor version, not 17 improvements later.

**Meta-observation:** v0.2.8 is the first patch that's *about the framework's own learning cadence* rather than about a specific workflow gap. Compass is now self-instrumenting. The convention-discovery lag of v0.1.8 → v0.2.8 (17 improvements to name the dominant pattern) was the worst it will ever be — every retro from here forward should shrink it.

---

### 2026-05-26 — Stack-aware canary + Team playbooks (v0.2.7)

**Friction:** The aura-app 2026-05-26 evening state-of-play update gave direct evidence that two previously-deferred improvements were now load-bearing:

- **AC4 (passkey enrollment ceremony) blocked on `eas build --profile development + AASA + Android assetlinks.json`** — i.e., the mobile dev build that should have been the canary artifact for the mobile target. v0.2.5's `deploy_canary_url` (single string) only covered the web target (Vercel). Multi-target projects like aura-app (web + mobile) silently passed Phase B Verification while one target was actually undeployable. Discovered as a blocker on the first feature bet — the worst possible time.
- **3 runbooks the user wants to write** (`pnpm-monorepo-rn.md`, `vercel-pnpm-monorepo.md`, `expo-go-vs-dev-build.md`) explicitly framed as *"captures today's learnings for the next Compass project."* That phrase IS the gap — the next Architect designing a similar stack should be structurally required to consult these, not have to remember they exist or hope someone tells them.

Both gaps were proposed in earlier triage rounds and the user chose to defer; both now had a concrete next-friction case driving them.

**Change:**

*Improvement 1 — stack-aware canary artifacts:*
- `compass/config.yaml` schema: `deploy_canary_url: ""` (single string) → `canary_artifacts: []` (list of `{kind, url, verified_at, notes?}`). Kinds: `web | mobile | container | other`.
- `/setup-foundation-architecture` Phase B step 16 rewritten: produce a canary per deploy target; populate `canary_artifacts[]` with one entry per target; if any target fails, return to Phase A. Verification updated to require every target covered.

*Improvement 2 — team playbooks + signal-consultation 5th category:*
- New template `compass/templates/playbook.md` — frontmatter with `stack_combo` tags, `related_bets`, `last_validated`. Sections: When this applies / Symptoms / Steps / Gotchas / References / Maintainer note.
- New `docs/playbooks/` directory convention — scaffolded by foundational architecture template's Boundaries section. Empty initially; populated lazily as learnings emerge.
- `/setup-foundation-architecture` step 6 signal consultation gained a 5th category — *Team playbooks: search `docs/playbooks/*` for prior stack-specific learnings; cite or mark `n/a — empty directory`.* Mandatory citation once the team has playbooks across projects.
- `/measure` Phase 4 step 11a — soft prompt when outcome resolves with notable technical learnings: *"Any stack / tooling insights from this bet worth capturing as a playbook for future Architects?"* Soft prompt, not gate. Captures learnings while freshest.

**Files touched:** `compass/config.yaml`, `compass/workflows/setup-foundation-architecture.md`, `compass/templates/playbook.md` (NEW), `compass/templates/foundation-architecture.md`, `compass/workflows/measure.md`, `CHANGELOG.md` (0.2.7), `compass/workflows/improvements.md`.

**Pattern observation:** the 5th category in signal consultation makes this the **5th instance of the cite-or-mark-n/a N-category enforcement pattern** across Compass (Researcher 6, Architect 6-pillar, signal-consultation now 5, story standard-experience 6, plus the playbook itself shaped similarly). The v0.2.6 improvements log flagged the threshold: codify as an AGENTS.md cross-cutting principle when the 6th instance lands. This v0.2.7 doesn't trip that threshold but moves us closer.

**Watch for:**

- **Multi-target canary fatigue.** Producing canaries for every target may be slow (mobile dev-build can take 10+ min). If teams skip targets ("we'll do mobile later"), the gate is failing — the whole point was to discover the missing target *before* feature work, not after. Watch suppression patterns; if "mobile canary deferred" becomes routine, add a scanner check that blocks `/create-brief` until all targets are green.
- **Playbook quality drift.** Playbooks are living, but `last_validated` dates can rot. Architects who cite a stale playbook then discover it's wrong have a worse experience than no playbook at all. Consider a scanner check that flags playbooks > 6 months past `last_validated` as Medium findings when they're cited. Defer until evidence demands it.
- **Signal-consultation category 5 "n/a — empty directory" becomes a permanent crutch.** First-project bootstrap legitimately has no playbooks; second-project should rarely have an empty directory. If `n/a — empty` shows up on the 3rd+ project, the team isn't capturing learnings (the `/measure` soft prompt isn't biting). Watch for it across projects.
- **Playbook scope creep.** Playbooks are *tool-combination* knowledge; they're not bet runbooks, incident postmortems, or general docs. If `docs/playbooks/` starts accumulating non-tool-combo content (general "how we work" docs, opinionated PR rules, etc.), tighten the template's "When this applies" guidance — playbooks must be invocable by a future Architect during foundational arch consultation, not just generic team wisdom.

---

### 2026-05-26 — Story AC missing standard-experience coverage; PM wrote stories without back-button (v0.2.6)

**Friction:** During the aura-app retrospective the user mentioned "3 small UX cleanups bundled with #1 — back-affordance on Handle screen (your observation), misleading 'network' error mapping on Passkey screen, error-state copy review." I initially categorized this as app-specific and moved on. The user corrected:

> *"the ux cleanup was about — stories that were written did not have back button for eg. if compass is writing the story we should give the team a template to create the best story possible covering the feature standard experience"*

**Root cause analysis:** When `/create-story` runs and PM drafts the story, the AC list is freeform — no structural prompt for navigation, states, feedback, accessibility, edge cases, or cross-surface consistency. The Designer + UX Writer roles individually cover state/accessibility/copy quality well in *their* artifacts, but the story AC (the actual implementation contract Engineer codes against and Codex tests against) doesn't echo it. Outcome: Designer draws the back button in Figma; story AC doesn't say "back navigation returns to <screen>"; Engineer implements only what AC specifies; Codex E2E tests only what AC specifies; ships without back button.

Three aura-app failures fit the same gap:
- **Missing back button** — Navigation category not in AC
- **Misleading "network" error on Passkey screen** — Feedback category not in AC (no error-type discrimination requirement)
- **Error-state copy review needed post-build** — Feedback category not in AC (copy quality expectations not specified)

All three should have surfaced at story-creation time, not as post-build QA cleanups requiring re-design loops.

**Change:**
- New "Standard Experience Checklist" section in `compass/templates/story.md` — 6 categories (Navigation, States, Feedback, Accessibility, Edge cases, Cross-surface consistency). Each either covered by ≥1 AC item OR explicitly `n/a — <reason>`. Same enforcement shape as Researcher 6-category, Architect 6-pillar, signal-consultation 5-category.
- `/create-story` step 7 requires checklist filled; new refusal case blocks empty categories from reaching `status: ready`.
- Designer DoD adds explicit cross-reference: design and AC must match; what's in Figma but not in AC will ship missing.
- UX Writer DoD adds error-type-discrimination requirement: generic "something went wrong" or mislabelled error types fail the Feedback category.

**Files touched:** `compass/templates/story.md`, `compass/workflows/create-story.md`, `compass/roles/designer.md`, `compass/roles/ux-writer.md`, `CHANGELOG.md` (0.2.6), `compass/workflows/improvements.md`.

**Meta-lesson — my miscategorization:** I read "3 UX cleanups bundled with #1" and pattern-matched to "app-specific polish, defer." That's exactly the kind of agent shortcut Compass keeps catching elsewhere. The user re-routed me to the structural gap underneath the symptoms. The relevant Compass principle (per AGENTS.md / cross-cutting): symptoms across multiple bets in the same shape ARE the signal of a missing structural constraint. Three UX issues "bundled" with another bet = three independent signals that the story-creation discipline wasn't catching standard UX expectations. Worth adding to my own scan-for-patterns when triaging future retrospectives: "are these N independent fixes really N fixes, or 1 missing constraint?"

**Watch for:**
- **Checklist becomes rote.** If PM starts marking every category as "covered by AC-1" without thinking, the gate is failing. Codex review or scanner could catch this with a "Standard Experience Checklist categories cite distinct AC numbers" check — defer until evidence shows the rot.
- **Categories don't fit certain story types.** Backend-only stories will mark most categories `n/a — backend-only`. Internal-tooling stories might skip accessibility. If "n/a" becomes the default for >50% of stories, the categories are too broad — tighten or add story-type-specific subsets.
- **The 6-category framework is the 4th instance of this pattern shape** (Researcher 6, Architect 6, signal-consultation 5, now standard-experience 6). Confirming that `cite-or-mark-n/a` is the right enforcement default across Compass for "agent could rationalize an omission." Worth codifying as an AGENTS.md cross-cutting principle if a 5th instance lands.

---

### 2026-05-26 — Three Compass gaps from a 13-issue aura-app triage (v0.2.5)

**Friction:** User finished a sprint in aura-app and produced a 13-issue retrospective covering: pnpm strict isolation × Metro module resolution (#1, #2, #4, #8); React 19 vs 18.3.1 version mismatch (#5, #10); react-native-screens / safe-area-context / expo-secure-store version drift (#3, #7); missing expo-constants peer deps (#6); New Architecture app.json flag (#9); `EXPO_PUBLIC_API_BASE_URL` defaulting to localhost on real device (#11); 4+ rounds of Vercel deploy failures (#12); Supabase `pg_uuidv7` missing in ap-south-1 (#13).

10 of 13 were app-specific Expo/pnpm/Metro/React tooling choices — explicitly out of scope per user ("expo and other are the app choices — we are not going into those yet"). Three issues, though, revealed Compass-shaped gaps:

- **#11 — env-var default works in dev, breaks elsewhere.** Prod build passes; the app boots into a broken state because `localhost` was the default and the device can't reach it. Engineer's spec didn't require auditing for this.
- **#12 — Vercel deploy failures discovered mid-project after multiple feature bets had started.** The foundational architecture committed to Turborepo + pnpm + Vercel + Next.js but never validated the full pipeline end-to-end. First deploy attempt was the discovery vector; took 4+ rounds of debugging (doubled output path, missing pnpm-lock, no Next.js detected, monorepo dashboard overrides interacting with vercel.ts).
- **#13 — Supabase `pg_uuidv7` extension assumed available; missing in ap-south-1.** Architect assumed vendor capability without verifying for the specific region. Same anti-pattern shape as the broader Architect-must-consult-signal fix (v0.2.4) but at finer grain — vendor capability per *deployment context* (region/SKU/plan-tier), not just per vendor.

**Change:**

*Improvement 1 — env-var / runtime-config audit:*
- `/build` step 7: added runtime-config audit block with explicit ban on silent `localhost` fallbacks. Defaults that only work in dev must throw at module load.
- Engineer DoD: added "Runtime-config audit clean" item with the same language.

*Improvement 2 — Phase B deploy-canary gate:*
- `/setup-foundation-architecture` Phase B: new step 16 — deploy hello-world from the scaffolded repo to the target environment. If fails, return to Phase A with ADR entry. Don't proceed to summary until canary green.
- Phase B Verification: added deploy-canary green check.
- `compass/config.yaml` `ci_cd`: new `deploy_canary_url` field populated by the canary.

*Improvement 3 — Production Ready scanner check PROD_READY-09:*
- New scanner check: vendor capability claims must have a doc citation that confirms availability for the specific deployment context (region, SKU, plan-tier, runtime version), not just generic vendor support.
- Severity High, suppressible with DRI rationale that includes manual-verification date.

**Files touched:** `compass/workflows/build.md`, `compass/roles/engineer.md`, `compass/workflows/setup-foundation-architecture.md`, `compass/config.yaml`, `compass/workflows/scan.md`, `CHANGELOG.md` (0.2.5), `compass/workflows/improvements.md`.

**Watch for:**

- **Deploy canary becomes a friction point at large scale.** For complex monorepos, the canary deploy might itself take 10+ minutes. If teams start skipping it (with bad rationale), tighten with a scanner check that gates `/create-brief` until `deploy_canary_url` is non-empty. Today: enforce via the verification checklist, but allow user-override if they really know what they're doing.
- **Runtime-config audit needs framework-aware tooling to actually enforce.** The spec says "fail loudly at module load" but Compass doesn't ship a lint rule for it. Each project's stack needs its own enforcement (e.g., `zod` schema for env vars, throwing at boot). Spec calls for the behavior; doesn't enforce mechanically. Worth a future "config helper" pattern across stacks.
- **Vendor capability check (PROD_READY-09) is verbose to satisfy.** Every vendor feature needs a citation. If teams find this punishing for stacks with many vendor features (e.g., 20+ AWS services), the check becomes noise. Watch suppression patterns; if >50% suppressed, the check is too broad — tighten to "non-baseline vendor features" only.
- **The deferred stack-composition matrix may surface again.** If issues like #1, #2, #4, #5, #8 keep recurring in spite of deploy-canary, the foundational arch template needs a section explicitly enumerating compatibility constraints between stack rows. Defer until evidence is clear.

---

### 2026-05-26 — Engineer skipped prod build; Architect quietly widened foundational stack (v0.2.4)

**Friction:** Two real-world failures from the aura-app project surfaced on the same day, both the same anti-pattern shape.

**Issue 1 — Engineer DoD missing prod build.** PR 2 opened after `pnpm typecheck` + `pnpm test` passed. Production build (`pnpm build`) was never run because it wasn't in the spec. Three downstream issues hit staging that the production build would have caught locally: bundling errors, dead-import elimination, env-var resolution. User correctly identified the missing constraint: "the story-Tests section calls for component tests but no production-build smoke test." Production build is genuinely uncatchable by typecheck + unit tests.

**Issue 2 — Architect recommended without checking foundational fit or existing signal.** The bet architecture introduced new tooling without checking whether the foundational stack already had a solution, whether prior bets had decided on this, whether observability showed the actual baseline. User reframed the diagnosis crisply:

> *"Ideally the arch check should be in foundational. If arch is changing or adding new tools in the bet architecture then we need to update the foundational — ADR etc."*

That reframe is the load-bearing insight. The fix isn't "bet architects should consult more signal" — it's "bet architects can't unilaterally widen the foundational stack." Foundational scope is the canonical home for tooling decisions. Bet architecture is constrained to operate within it. Deviations escalate to foundational amendments with structured ADR entries.

**Change:**

*Issue 1 (Engineer prod-build):*
- `/build` Phase 2 step 7: production build added as required local check, with explicit *why* (catches bundling / dead-imports / env-vars / asset pipeline / monorepo workspace resolution — things typecheck + unit tests can't see).
- Engineer role Definition of Done: "Production build green" added as a required item.

*Issue 2 (Foundational-first signal consultation + bet-arch deviation gate):*
- `/create-bet-architecture` new step 7: **foundational-stack deviation gate.** Refuses to proceed if the bet needs tools/services/frameworks/data stores/runtimes/dependencies outside `docs/foundation/architecture.md` Stack table. Tells user to run `/setup-foundation-architecture` amend first. Logs the deviation as a DRI Issue on the bet.
- `/setup-foundation-architecture` Phase A: 4-category signal-consultation framework (production observability / recent PR feedback / prior architectural decisions across bets / bet-arch deviation pressure). Each cite-or-mark-n/a-with-reason. Especially load-bearing on amend flows.
- Architect role: Input list extended to call out foundational Stack table as canonical; DoD requires explicit "no deviation" assertion or escalation note.
- `foundation-architecture.md` template: new **ADR / Amendments** section with structured entry shape (Triggered by / What changed / Why / Reversibility / Cited signal). Required to have ≥1 entry on any foundational version > 1.

**Files touched:** `compass/workflows/build.md`, `compass/roles/engineer.md`, `compass/workflows/create-bet-architecture.md`, `compass/workflows/setup-foundation-architecture.md`, `compass/roles/architect.md`, `compass/templates/foundation-architecture.md`, `CHANGELOG.md` (0.2.4), `compass/workflows/improvements.md`.

**Watch for:**

- **The deviation gate may feel punitive at first.** Bets that genuinely need new tooling now have to round-trip through a foundational amendment. That round-trip *is the point* — but if users start trying to characterize legitimate new dependencies as "not really tooling," consider tightening the deviation-gate definition with a concrete list ("major dependency" = anything that needs a config file, runs in its own process, has its own backup strategy, or costs >$50/month).
- **ADR sprawl.** If amendments happen frequently, the ADR section grows long. Today's inline approach is fine for small/early projects; at scale (50+ ADRs) consider splitting into `docs/foundation/adrs/<ADR-NNN>.md` files with an index in foundational arch. Defer until friction is real.
- **Signal-consultation citations rot.** Sentry links, PR numbers, MCP URLs all decay over time. The DRI log preserves the *reasoning*; the citation is the *receipt*. If reviewers start finding dead citations during audits, add a citation-freshness sub-check to the scanner.
- **Engineer prod-build catches a class of bug; doesn't catch all classes.** Production build verifies the build pipeline; it doesn't verify runtime correctness in a production-like environment. Future improvement: add a staging-smoke step to the build workflow (separate from prod-build) that exercises the deployed artifact. Out of scope for this round.

---

### 2026-05-25 — Dashboard agent silently summarized artifacts; verbatim wasn't load-bearing enough (v0.2.3)

**Friction:** First real `/dashboard` run in a consuming project (aura-app) produced a 42 KB HTML file that *looked* fine — until the agent's own status report revealed it had silently summarized 4 of the 9 inlined artifacts (product.md v2, architecture.md v1, architecture-research.md, portfolio.md were "executive summaries of the larger sections"; the rest were verbatim). The agent's stated rationale: "to keep the file at 42 KB and reviewable."

This is the same anti-pattern shape as the Researcher "log-and-walk-away" (v0.1.9) and the Architect "smart defaults" (v0.1.11) — an agent rationalizes a shortcut, taking soft spec language ("inline ... verbatim") as permission to optimize on a constraint that doesn't actually bind. Three things made the violation particularly bad:

- **The framing was invented.** "42 KB is reviewable; 300 KB isn't" is wrong on both counts. Reviewers don't read `dashboard.html` (it's gitignored as of v0.2.2). Stakeholders open it in a browser, where 300 KB loads in well under a second.
- **Summaries create a second source of truth.** The dashboard's only value is being a *faithful view* of the underlying markdown. The moment summaries enter, stakeholders read the dashboard *instead of* the real artifacts, and discovering the dashboard's message differs from the source is the kind of trust failure that kills the dashboard's usefulness.
- **The careful structured detail gets lost.** DRI entries, per-row pillar evaluations, complete alternatives tables, full citation lists — exactly the things stakeholders need to verify the work — get quietly dropped in "executive summarization." That's the worst kind of drift: information loss disguised as readability gain.

**Change:**
- Workflow step 7 rewritten with explicit, load-bearing language: do NOT pre-render, do NOT summarize (with concrete examples of bad summarization framings to head off "but I just lightly condensed it" rationalizations), do NOT truncate, do NOT reword. Includes a "Why this is non-negotiable" rationale block so future agents reading the spec cold see why the constraint matters.
- New Verification item: every inlined artifact's content matches source byte-for-byte. Spot-check via `diff`.
- New anti-pattern in Notes section: "Silent summarization is the failure mode." Names the invented-constraint framing trap directly and points at a future `/dashboard --summary` opt-in as the right escape hatch.

**Files touched:** `compass/workflows/dashboard.md`, `CHANGELOG.md` (0.2.3), `compass/workflows/improvements.md`.

**Why no `--summary` flag is added yet:** real friction (very large projects where 300 KB becomes 3 MB) hasn't been observed. Pre-building escape hatches before the constraint has been tested invites the same agent rationalization at lower scale — "well there's a `--summary` mode for a reason, this project is *kind of* large..." Build the flag when real users actually need it.

**Watch for:**
- **Agents rationalizing other shortcuts.** The same pattern (soft spec → agent invents a constraint → silent optimization) may surface in other workflows. Watch for it especially in workflows where the output is large or visually inspected (scan reports, metrics snapshots, plan calendars). The fix shape is the same: make the constraint load-bearing, add verification, name the anti-pattern, give the rationale.
- **Agents skipping the verbatim-spot-check verification step.** Adding the checklist item is necessary but not sufficient — agents may write the item then skip running the actual `diff`. If this becomes a pattern, consider a stronger forcing function (e.g., the workflow output must include a quoted diff snippet from spot-checking).
- **Users requesting `--summary` mode prematurely.** If multiple users ask for it before real size-friction emerges, that's a signal the dashboard's structure isn't matching their actual use case — consider a "table of contents only" view (collapse-by-default) rather than summarization.

---

### 2026-05-24 — Dashboard diff churn; need a gitignore rule for pure derived views (v0.2.2)

**Friction:** First real `/dashboard` run in a consuming project (aura-app) produced a ~2500-line `docs/dashboard.html` (9 markdown artifacts inlined verbatim). Architecturally fine — modern browsers + editors handle it without issue. But every `/scan`, `/plan`, `/metrics`, `/status` rewrites the whole file, so each workflow run produces a ~2500-line diff that grows linearly with project size. The diff isn't human-meaningful (the source-of-truth diff lives in the underlying markdown), and reviewers will tune out, which means a real bug in the dashboard template would slip through review.

**Change:**
- Added `docs/dashboard.html` to the Compass framework's root `.gitignore` (didn't exist before — created fresh).
- Documented in `SETUP.md` that consuming projects should add the same line to their `.gitignore`, with the rationale + one-liner command.
- Updated the `/dashboard` workflow's Output section to state "gitignored by convention" and explain why.
- Articulated the rule explicitly in the workflow + this improvements log: **gitignore only pure views derived from other tracked files with no user-relevant state of their own.**

**Files touched:** `.gitignore` (new), `compass/workflows/dashboard.md`, `SETUP.md`, `CHANGELOG.md` (0.2.2), `compass/workflows/improvements.md`.

**Why other living artifacts stay tracked:**

| Artifact | Carries user state? | Tracked? |
|---|---|---|
| `docs/dashboard.html` | No — pure view | ❌ ignored |
| `docs/foundation/plan.md` | Yes — refinement log accumulates per-refresh entries | ✅ tracked |
| `docs/bets/<id>/scan-report.md` | Yes — preserves suppressions with HITL approvals | ✅ tracked |
| `docs/metrics/<bet-id>-<date>.{md,json}` | Yes — dated time-series, never overwritten | ✅ tracked |
| `docs/status.md` | Yes — humans read history in retros | ✅ tracked |

**Watch for:**
- **Other pure views may emerge.** If we add HTML exports of individual reports, or a `--publish` mode that writes to a public dir, those need the same gitignore treatment. Update the rule above when it happens.
- **Already-committed dashboards in existing consuming projects** need `git rm --cached docs/dashboard.html` to untrack, not just `.gitignore` (which only affects new files). SETUP.md mentions this for consuming projects.
- **Stakeholders who want git history of dashboard state** (e.g., "what did the scan look like 3 weeks ago?") won't get it from git anymore. They get it from the dated metrics snapshots + the scan report's own scan-history table, which preserves the data without the diff churn.

---

### 2026-05-24 — Living artifacts were IDE-only; stakeholders needed a browser view (v0.2.1)

**Friction:** v0.2.0 produced a lot of living artifacts — scan reports per bet, metrics snapshots, plan, portfolio, status. Useful inside the IDE (engineers reading markdown in their editor) and useful for AI consumption (workflows read them). But **stakeholders skim**: PMs, leadership, on-call rotation, anyone outside the IDE wanted to open a URL or attach a file and see current state. Spelunking `docs/bets/*/scan-report.md` across 12 bets is not skim-friendly. Markdown rendered on GitHub is OK if the repo is public and the audience knows the URL — but most teams' repos are private and stakeholders don't have GitHub access. Result: the living artifacts were structurally invisible to the people they were ultimately for.

The user named the gap: "we should have the scan and metrics open in an html view." Extended in brainstorm to all derived/living artifacts (plan, portfolio, status too) — same audience, same shape.

**Change:**
- New `/dashboard` workflow + `compass/templates/dashboard.html.template` + `.claude/skills/dashboard/SKILL.md`.
- Output: single self-contained `docs/dashboard.html`. Opens via `file://`. Six tabs: Foundation / Plan / Portfolio / Scan / Metrics / Status. Marked.js + Mermaid.js via jsDelivr CDN.
- **Key implementation insight: AI agent as generator.** Compass is markdown-as-prompt for AI tools. Claude running `/dashboard` reads the markdown reports and inlines them into the HTML template via the Write tool. No Node, no Python, no Pandoc. Zero new toolchain dependencies.
- **CORS-safe by inlining.** Browsers block `fetch()` over `file://`. Inlining markdown into `<script type="text/markdown">` blocks at generation time avoids needing a server.
- `/scan`, `/metrics`, `/plan`, `/status` auto-invoke `/dashboard` at the end of their process. `/advance` triggers it transitively via `/plan`. The browser view never goes stale during normal workflow usage.
- Project Manager role owns `/dashboard` (rolling-visibility mandate alongside `/status` and `/plan`).
- AGENTS.md workflow count: 16 → 17.

**Files touched:** new — `compass/workflows/dashboard.md`, `compass/templates/dashboard.html.template`, `.claude/skills/dashboard/SKILL.md`. Edited — `compass/workflows/scan.md`, `metrics.md`, `plan.md`, `status.md`, `create-bet-portfolio.md`, `advance.md`, `compass/roles/project-manager.md`, `AGENTS.md`, `CLAUDE.md`, `README.md`, `SETUP.md`, `CHANGELOG.md` (0.2.1), `compass/workflows/improvements.md`.

**Watch for:**
- **Diff churn.** Every `/scan`, `/metrics`, `/plan`, `/status` run rewrites the entire `docs/dashboard.html`. Diffs will be large because the file inlines all artifacts. Consider git-ignoring `docs/dashboard.html` if reviewers find the noise unhelpful (the file regenerates anyway).
- **Mermaid via CDN at runtime.** ~600KB gzipped on first open. Works offline only if cached. Consider self-hosting the JS deps in the repo if offline-first becomes a requirement.
- **Stakeholder-facing content.** Now that markdown gets surfaced to non-engineering audiences, internal-only language ("DRI", "HITL gate", "blocking_advance") may need glossing. Watch for confused stakeholder questions; consider adding a "What this means" tooltip for jargon if it becomes friction.
- **Scale.** AI-driven HTML generation works at small/early project scale (3-6 MVP bets, ~20 living artifacts). At 30+ bets the inlined HTML becomes large and AI generation slows. At that point, replace with a Node/Python script generator — same template + COMPASS-INSERT marker convention, just faster.
- **`/dashboard --publish <target>` is deferred.** If hosted (Confluence / Notion / GitHub Pages) becomes useful, add a publish mode that pushes via MCP. The single-file approach handles the most common need (share an attachment) first.

---

### 2026-05-24 — Quality gates were rubric-shaped; engineers resent rubrics, trust scanners (v0.2.0)

**Friction:** Compass v0.1 grew a lot of verification gates — each new workflow had its own checklist (Researcher must produce evidence in 3+ categories; Architect must score every stack row on 6 pillars; portfolio must have ≥1 post-MVP item; etc.). All useful, all framed as **rubrics the owner self-applies**: "did I do this?" boolean. That works at the foundational/wedge layer where the gates are big and infrequent, but it doesn't scale to SDLC-wide quality (Production Ready, GTM, Operate), and rubrics get political — they feel like grading, not informing. Meanwhile, the *Production Ready* phase was effectively silent in Compass: runbook, SLO, monitoring, rollback, on-call, backup, cost monitoring, compliance lived as vague intentions scattered across role docs, owned by nobody. Bets were getting "shipped" without runbooks; SLO files never existed; rollback was discussed in standup but never tested. Incidents revealed gaps that should have been caught structurally.

The reframe: **engineers don't resent scanners.** Snyk, Semgrep, GitHub Advanced Security, Dependabot — all run continuously, produce *findings* (not failures), give each finding a severity + confidence + location + reason + fix, support suppressions with justification. Engineers triage findings without taking it personally. Same shape, applied to the product lifecycle.

**Change:**
- New `/scan` workflow, Scanner role (read-only), `scan-report.md` template.
- Six SDLC phases formally documented: Product, Architecture, Build, **Production Ready** (new), GTM, Operate.
- 44 checks across the six phases, catalogued in `compass/workflows/scan.md` (single source of truth — new checks added there, not improvised by role).
- Finding shape: severity (Critical / High / Medium / Low) + confidence (High / Medium / Low) + location + reason + fix + applies-to + suppressible. Same vocabulary engineers already use from security tooling.
- Confidence derivation is canonical (content depth + source freshness + cross-artifact corroboration) and the Reason field states the reasoning so owners see how the scanner concluded.
- Suppression policy: HITL-approval for Critical (with non-suppressible carve-outs for PII / regulated data / breaking changes / legal), DRI-justification for High, owner-acceptance for Medium, silent-but-logged for Low.
- `/advance` auto-runs `/scan` before any phase transition. `strict` mode blocks on Critical; `advisory` mode warns. Non-suppressible Critical always blocks.
- `/build` auto-runs `/scan` at phase boundaries (Build → Production Ready → GTM → Operate). Catches missing production-readiness work *before* the bet is treated as shipped.
- `/metrics` gained an Open Findings posture roll-up — counts by severity, top patterns, suppressions, time-to-remediate, trends.
- AGENTS.md principle #13 codifies the model.

**Files touched:** new — `compass/workflows/scan.md`, `compass/templates/scan-report.md`, `compass/roles/scanner.md`, `.claude/skills/scan/SKILL.md`. Edited — `AGENTS.md` (principle #13 + 13 roles + 16 workflows), `compass/workflows/advance.md` (scanner block semantics), `compass/workflows/build.md` (phase-boundary scans), `compass/workflows/metrics.md` (Open Findings section), `compass/config.yaml` (scanner: section), `compass/templates/brief.md` (Scan summary section), `README.md` (principle + flow), `CHANGELOG.md` (v0.2.0), `compass/workflows/improvements.md`.

**Watch for:**
- **Check fatigue.** 44 checks across 6 phases is a lot. The point is each check fires only when its evidence is missing, and Low/Medium findings don't block anything. If teams start treating Low findings as work, tighten the catalog or push more to `silent_dismissal_logged`.
- **False positives on confidence.** The "content depth" signal is heuristic — minimal files are flagged Medium-confidence. Some legitimate "the doc is short because the bet is small" cases will get flagged. Watch suppression patterns; if a check is suppressed > 50% of the time, it's a bad check, not a bad team — rewrite it.
- **Hand-edited scan reports** — anti-pattern; next scan overwrites. Suppressions are preserved by finding ID, not by hand-edit. If users start hand-editing reports, they're trying to express something the suppression model can't — add it as a first-class field.
- **Scanner role drift.** Scanner is supposed to be read-only. If a future change has Scanner writing to product artifacts (brief, architecture, runbook), that breaks the model. Owners decide; scanner informs.
- **Production Ready phase is new.** Existing in-flight bets won't have runbook/SLO/monitoring. First scan against any current bet will likely produce 5-8 Production Ready findings. Expect a triage wave; treat it as the value of the scanner, not noise.
- **Aggregate posture in `/metrics`** can become a dashboard people optimize for instead of fix root causes for (Goodhart). If "critical findings count" becomes the metric, watch for teams gaming via suppression. The suppression rationale audit is the counter — if rationales become rote, the gate is failing.

---

### 2026-05-24 — No time-bound plan; outputs didn't feed forward to scheduling

**Friction:** The portfolio gave us a *logical* plan (dependency graph showing which bet depends on which). What it didn't give us was a *temporal* plan — when each bet starts, when it ends, who's on it, which streams run in parallel on the calendar. And while each workflow did load prior artifacts (architecture loads product bet, brief loads portfolio, etc.), the "output → input to next phase's plan" linkage was implicit in the read order, not explicit anywhere. Practical fallout: "when can we ship the MVP?" was unanswerable in concrete dates; the portfolio's parallel-build candidates sat unused because no calendar showed when each stream actually started; estimates never tightened because they lived in someone's head, not in an artifact; slip detection was reactive ("someone noticed we missed the date") rather than computed (the plan would have shown the slip the day after a phase finished late).

The user named the deeper principle: **each phase's output should be an input to the plan for the next phase.** The plan should sharpen as evidence lands (brief approval refines scope estimate; architecture approval refines effort estimate; build start writes actuals).

**Change:**
- New `/plan` workflow + `docs/foundation/plan.md` living artifact. Status is `living` — never `proposed` or `approved`. Derived from per-bet artifacts; PM owns the rolling refresh.
- Estimate model: each bet's `estimate` frontmatter (`duration_weeks`, `confidence`, `refined_by`, `refined_at`) sharpens through the phases — stub default 2wk → brief approval (scope-sized 1/2/4wk) → architecture approval (+1wk if arch required) → stories (count × per-story size) → build PRs merged (actuals).
- Refinement log inside `plan.md` writes a row every time a date moves, naming the triggering artifact. This is the audit trail for "output → input" causality.
- **`/advance` auto-runs `/plan` as its final step.** This is the load-bearing mechanic — users never have to remember to refresh the plan; every phase advance does it.
- `/status` now reads the plan rather than recomputing schedule data; adds plan-freshness signal to health metrics.
- `/create-bet-portfolio` Output section points at `/plan` as the immediate next step after portfolio HITL approval (seeds the schedule).

**Files touched:** new — `compass/workflows/plan.md`, `compass/templates/plan.md`, `.claude/skills/plan/SKILL.md`. Edited — `compass/workflows/advance.md` (auto-trigger), `compass/workflows/status.md` (reads plan), `compass/workflows/create-bet-portfolio.md` (next-step pointer), `compass/templates/brief.md` (estimate block), `compass/roles/project-manager.md`, `AGENTS.md`, `CLAUDE.md`, `SETUP.md`, `README.md`, `CHANGELOG.md` (0.1.14), `compass/workflows/improvements.md`.

**Watch for:**
- **Hand-editing `plan.md`** — anti-pattern; the next `/plan` run will overwrite. If users start hand-editing, they're probably trying to express something the estimate model can't capture (custom override, manual lock). Watch for it and consider an `override` field on the bet's `estimate` block rather than letting plan-edits land.
- **Stale plan + `/status` divergence** — if `/advance` is bypassed (user edits artifact status directly), the plan goes stale and `/status` flags it. If this becomes common, consider adding a hook that fires `/plan` on any artifact `status:` change, not only on `/advance`.
- **Estimate accuracy** — the default duration_weeks (2 for stub; 1/2/4 for small/medium/large brief; +1 for architecture; 3 days per story) are coarse heuristics. After a few projects, look at refinement log → actuals deltas and tune. Don't tune from a single project.
- **Auto-trigger from `/advance` may be noisy** if `/advance` is called many times per day. Acceptable for now (plan refresh is cheap). If it gets expensive at scale (large bet count + git+MCP reads each time), consider debouncing or marking the plan stale instead of refreshing eagerly.

---

### 2026-05-24 — Bootstrap forced bets serial; teams idle, deps invisible

**Friction:** The methodology said "PM decomposes bets one at a time." That's correct in steady state — ship a bet, learn, file the next. But for new projects, the MVP is rarely one bet — it's typically a wedge of 3-6 bets (auth + core capability + persistence + engagement loop, etc.) that together form a viable product slice. Forcing them serial during bootstrap meant: foundational architecture got decided knowing only bet 1's needs (bets 2-6 then kept breaking it); teams sat idle waiting for the previous bet to clear; cross-bet dependencies stayed invisible until they bit; no parallel build streams were possible.

The user observed the real-world pattern: "create the bets across all and then have the build start in parallel." But this needed to be **bootstrap-only** to avoid becoming a waterfall mini-roadmap, and **strictly MVP** to avoid scope padding.

**Change:**
- New workflow `/create-bet-portfolio` — bootstrap-only, runs once per project after foundation product + architecture are approved.
- Workflow elicits MVP definition via a forcing question ("what does this product need to do for one real user to complete the core value loop once?"). Verbatim user answer becomes the load-bearing scope statement at the top of the portfolio doc.
- Drafts 3-6 stub briefs (MVP bets only) with new frontmatter fields `portfolio_stub`, `depends_on`, `parallel_with`. Each stub traces its one-line hypothesis back to a specific line in the product bet.
- Drafts `docs/foundation/portfolio.md` with Mermaid `flowchart` dependency graph + explicit parallel-build candidates + a "Deliberately out of MVP" section for the user's "tempted to include but actually post-MVP" items.
- `/create-brief` gained a promote-stub mode: `/create-brief <bet-id>` fills in the full content for a portfolio stub and clears the flag. Fresh-bet creation mode is unchanged.
- State detection prevents re-bootstrapping: once any stub has been promoted, `/create-bet-portfolio` refuses re-invocation. New bets after MVP go through `/create-brief` fresh.
- Two distinct HITL approvals per bootstrap bet: portfolio approval ("yes, this is the wedge") + per-brief approval after promotion ("yes, this is what bet N specifically should be"). Deliberate.
- Researcher engagement is mandatory in the new workflow (same enforcement as setup-product) — surfaces MVP wedge patterns from comparable products as a sanity check on the user's MVP definition.

**Files touched:** new — `compass/workflows/create-bet-portfolio.md`, `compass/templates/portfolio.md`, `.claude/skills/create-bet-portfolio/SKILL.md`. Edited — `compass/workflows/create-brief.md` (promote-stub mode), `compass/workflows/setup-foundation-architecture.md` (next-step pointer), `compass/templates/brief.md` (new frontmatter fields), `compass/roles/pm.md`, `compass/roles/researcher.md`, `AGENTS.md`, `CLAUDE.md`, `SETUP.md`, `README.md`, `CHANGELOG.md` (0.1.13), `compass/workflows/improvements.md`.

**Watch for:**
- **Scope creep at the MVP line.** The "Deliberately out of MVP" section is where this gets tested. If users keep proposing 7-10 MVP bets, the forcing question isn't biting. Consider tightening to a hard cap of 6 (warning today is soft).
- **Re-bootstrap requests** — users may want to re-run `/create-bet-portfolio` mid-project for a new strategic batch (post-PMF expansion, new vertical). The current refusal is intentional, but if it becomes a common pain, the answer is probably an OKR bet that decomposes via `/create-brief`, not a re-bootstrap. Watch for the request and resist building the wrong escape hatch.
- **Promotion order vs. dependency graph.** If users promote stubs out of dependency order (e.g., promote a dependent bet before its prerequisite), nothing in the workflow stops them — the dependency graph is informational. If misuse becomes common, add a refusal in `/create-brief` promote-mode that checks `depends_on` status.
- **Stub brief content drift before promotion.** If users hand-edit stub briefs between portfolio approval and `/create-brief` promotion, the promotion may overwrite their edits. Watch for this and consider an "extend rather than overwrite" mode if it bites.

---

### 2026-05-24 — DB was being picked without a data model

**Friction:** Review of the just-shipped 0.1.11 foundational-architecture work surfaced a gap: Phase A went from architecture research straight to the 13 stack choices, with no derivation of the data model the DB choice should depend on. Same decide-before-derive anti-pattern as fitness-functions-before-stack and HITL-before-scaffold, in microcosm. The DB row was effectively chosen by preference, then the data model would have been retrofitted by per-bet Architects — meaning every bet would have to live with a DB chosen before anyone knew the entity shape, tenancy, audit posture, or PII posture.

**Change:**
- New Phase A step (#7): **Derive foundational data model.** Covers core entities (each traced to a product bet line — no invented entities), identity strategy, tenancy, audit posture, delete posture, PII handling, timestamps, migration strategy, and a Mermaid `erDiagram` with cardinality.
- Step runs **before** stack choices. The Database row in the Stack table must cite the foundational data model — DB choice that ignores entity shape, tenancy, or audit fails verification.
- New "Deriving the foundational data model" subsection in the EA role explains how each decision is derived from product bet content (entities from nouns, tenancy from personas + moats, audit from compliance, PII from user segment, migration from Reliability + Ops fitness functions).
- Phase A Verification gate extended with data-model items. Phase B numbering bumped 12-15 → 13-16 to accommodate.
- Mermaid `erDiagram` adopted as the canonical ERD format — renders inline in GitHub + Confluence, plain text in source.

**Files touched:** `compass/workflows/setup-foundation-architecture.md`, `compass/templates/foundation-architecture.md`, `compass/roles/enterprise-architect.md`, `CHANGELOG.md` (0.1.12), `compass/workflows/improvements.md`.

**Watch for:**
- The trace-back-to-product-bet rule is the load-bearing enforcement here. If users hit a case where the product bet genuinely doesn't imply a needed entity (e.g., billing entities in a product bet that focuses on the user experience), they'll either invent the entity (bypassing the rule) or amend the product bet. Amending is correct; if invention becomes common, the rule needs softening with an explicit "system-required entity" carve-out.
- Mermaid ERD may grow stale faster than the rest of the doc — refreshing it should be a step in any `/setup-foundation-architecture` amend flow (creates v2).
- Per-bet `/create-bet-architecture` should be the next place to audit: does it inherit + extend the foundational data model cleanly, or does it duplicate decisions? Probably needs a "delta from foundation" enforcement.

---

### 2026-05-24 — Foundational architecture was "picked" not "derived"; scaffolded before HITL

**Friction:** Same anti-pattern as the Researcher fix, but in a new role. The `/setup-foundation-architecture` workflow jumped from "load product bet" straight to "ask 13 stack questions with smart defaults." Stack rows landed as personal preference; the Alternatives table got filled retroactively to justify the choice. No derivation evidence linked any stack row to the product bet's constraints. The Enterprise Architect had no analog to the Researcher's 6-category framework — "smart defaults" was hand-waving at research that should have been explicit. Compounding it: the HITL approval gate was the *final* step, after scaffolding had already written files to the repo. Architecture got approved *after* the repo was committed to it — backwards.

**Change:**
- Workflow split into two explicit phases separated by a hard HITL stop:
  - **Phase A — Decide & Document.** Derive fitness functions (≥1 per Well-Architected pillar, measurable in numbers), do research across the 6 architecture-research categories, score every stack choice on all 6 pillars with rationale + cited research. Draft the doc. No code written.
  - **HITL gate.** Hard stop. Human approves the architecture document.
  - **Phase B — Scaffold.** Only runs after approval. Lists files before writing, confirms with user, scaffolds.
- New 6-category architecture-research framework baked into the Enterprise/Solution Architect role: prior art, benchmarks, vendor health, failure modes, pillar fit, reversibility honesty.
- AWS Well-Architected pillars (6) adopted verbatim as the per-choice rubric. Canonical, externally validated, hard to fake.
- Fitness Functions section added to the template — falsifiable architectural targets that the stack must satisfy.
- Alternatives table rebuilt to evaluate against fitness functions, not generic pros/cons. Strawmen banned.
- New "When the product bet is vision-only on workloads" subsection in the EA role — workload-shape derivation is the architect's job.
- State-detection table at the workflow top routes between Phase A / refusal / Phase B based on artifact status.

**Files touched:** `compass/workflows/setup-foundation-architecture.md`, `compass/roles/enterprise-architect.md`, `compass/templates/foundation-architecture.md`, `CHANGELOG.md` (0.1.11), `compass/workflows/improvements.md`.

**Watch for:**
- The next instance of this anti-pattern is likely `/create-bet-architecture` — the per-bet Architect role has the same "make decisions" shape and currently no derivation framework. If/when it surfaces, mirror the Phase-A/Phase-B split with bet-scoped fitness functions instead of foundational ones.
- The pillar scoring may become rote check-the-box. If that happens, tighten on *evidence quality* (specific citations, primary sources, comparable workloads) rather than presence.
- The HITL split adds friction — measure whether users complete both phases or get stuck after Phase A. If stuck, the rejection rationale should be a real DRI Risk, not an abandoned workflow.

---

### 2026-05-24 — Architecture rename was half-applied; skill pointed at a missing file

**Friction:** The intended rename (`setup-architecture` → `setup-foundation-architecture`; `create-architecture` → `create-bet-architecture`) had been applied to *documentation* (AGENTS.md, SETUP.md, CLAUDE.md) and to the create-architecture file/skill — but the `setup-architecture` workflow file and skill directory still used the old name. The `.claude/skills/setup-architecture/SKILL.md` told the runtime to execute `compass/workflows/setup-foundation-architecture.md`, a file that did not exist on disk. The skill would have failed silently on first invocation. Stale `/setup architecture` (space-form) and `/create-architecture` command references were scattered across role docs, README, PROJECT.md, and docs/status.md. A duplicate `compass/improvements.md` had also been created next to the canonical `compass/workflows/improvements.md`.

**Change:**
- `git mv` for `compass/workflows/setup-architecture.md` → `setup-foundation-architecture.md` and the matching skill directory.
- Updated `name:` field in the renamed SKILL.md.
- Standardized all command references on hyphen-slug form (`/setup-product`, `/setup-foundation-architecture`, `/create-bet-architecture`) across README, AGENTS, CLAUDE, PROJECT, SETUP, docs/status, and all role + workflow files.
- Merged the duplicate improvements log into the canonical `compass/workflows/improvements.md`; deleted the duplicate at `compass/improvements.md`.

**Files touched:** `compass/workflows/setup-foundation-architecture.md` (renamed), `.claude/skills/setup-foundation-architecture/SKILL.md` (renamed dir + content), `compass/workflows/setup-product.md`, `compass/workflows/create-bet-architecture.md`, `compass/workflows/create-brief.md`, `compass/roles/architect.md`, `compass/roles/enterprise-architect.md`, `compass/roles/pm.md`, `AGENTS.md`, `CLAUDE.md`, `PROJECT.md`, `README.md`, `SETUP.md`, `docs/status.md`, `compass/workflows/improvements.md`, `CHANGELOG.md` (0.1.10).

**Watch for:**
- Future renames: do them with `git mv` + `grep -rn` sweep + skill `name:` field check, all in one PR. The half-applied state here was nearly invisible because docs and skill name diverged silently.
- The canonical improvements log lives at `compass/workflows/improvements.md`, not `compass/improvements.md` — easy mistake to repeat from a glance at the file tree.
