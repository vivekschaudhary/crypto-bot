<!--
  HOW TO USE THIS TEMPLATE
  ─────────────────────────────────────────────────────────────────────────
  This is the canonical v0.3+ workflow shape. Every workflow file in
  compass/workflows/ should follow this structure exactly. The HTML
  comments inline explain each section's purpose; preserve them when
  translating an existing workflow so future translators inherit intent.

  Sections are REQUIRED unless marked optional. Do not invent ad-hoc
  sections. If a workflow needs to express something the template
  doesn't cover, propose a template extension as its own patch — don't
  bend an individual workflow to fit.

  See AGENTS.md → "Workflow structure" for the principle behind the
  gate/work/postcondition pattern (instantiates cross-cutting #14).
-->

---
name: <workflow-name>            # e.g., setup-product, create-brief
status: active                   # active | deprecated | experimental
owner: <role>                    # primary role (e.g., pm, enterprise-architect, project-manager)
auto_invokes: []                 # workflows this one calls at its end (e.g., [plan, dashboard])
invoked_by: []                   # workflows that auto-call this one
version: 0.3.0-alpha             # workflow's own hardening version; bump on next hardening
---

# Workflow: /<name>

## Framework grounding

<!--
  REQUIRED in v0.3+. Names the canonical frameworks this workflow
  operationalizes so future translators understand WHY each gate exists.
  Without grounding, gates look like arbitrary ceremony; with grounding,
  they're auditable lineage back to established practice.

  Citations use short-form referring to `compass/framework/canon.md`:
  e.g., [working-backwards] → expands to the canon entry.

  Sections (use as many as apply; omit a section if genuinely n/a):
  • Strategy / discovery foundations
  • Competitive position
  • Bet-based commitment
  • Communication discipline
  • Goal-setting
  • Compass-original patterns operationalized (principles + named patterns)
  • Verifies adherence to (cross-cutting principles this workflow enforces)

  Honest labeling: industry standards cited with year + primary source;
  books with author/title/year; Compass-originals labeled as such
  (not pretending peer-review).
-->

- **Strategy / discovery:** <citations from canon.md>
- **Competitive position:** <citations>
- **Bet-based commitment:** <citations>
- **Communication discipline:** <citations>
- **Goal-setting:** <citations>
- **Compass-originals operationalized:** <named patterns>
- **Verifies adherence to:** <cross-cutting principle numbers + brief scope>

## Purpose

<!-- ONE SENTENCE. Names what the workflow does and the artifact it produces. -->

<one sentence>

## Preconditions (workflow-level GATE — checked once at start)

<!--
  Mechanically-checkable conditions that must hold before any step runs.
  Each failure case has an explicit refuse-and-redirect ("on failure,
  refuse with: tell user to do X"). These subsume what older workflows
  called "Refusal cases."
-->

- **<condition name>** — <what to check> — **on failure, refuse with:** "<message + redirect>"

## Roles invoked

<!--
  Role files loaded during execution, in order. Helps a future Architect
  trace role-context flow without reading every step.
-->

- `compass/roles/<role>.md` — <when in this workflow>

## Steps

<!--
  Each step is a TRIPLET: Precondition / Work / Postcondition.

  • Precondition (GATE): mechanically-checkable; what must be true before
    this step runs. Usually derives from the prior step's postcondition.

  • Work (Claude): what Claude does in this step, with a specific output
    contract. Bounded judgment — name the failure modes that get
    rationalized away (per principle #14), don't leave them implicit.

  • Postcondition (GATE): mechanically-checkable; verifiable artifact or
    state change. Mirrors into the final Verification checklist.

  If a step genuinely resists clean triplet separation (e.g., pure
  context-loading where the postcondition is "Claude understands the role
  now"), document the friction in Notes → Edge cases. Don't bend the
  triplet to fit; flag it so the template can evolve.

  ELICITATION STEPS: when a workflow's job is to surface choices to the
  user (stack picks, configuration decisions, posture declarations), use
  the [elicitation-with-options] Compass-original pattern (see
  `compass/framework/canon.md`): static 3 options for an anchor decision +
  cascading 3 options for subsequent decisions biased by prior picks +
  "Other (specify)" escape valve. Each elicitation step is a normal
  triplet — Precondition (prior picks captured) / Work (present options,
  ask user, record pick + rationale) / Postcondition (pick captured with
  cited option). DO NOT draft with "smart defaults" and ask the user to
  approve — that's the rationalization surface principle #14 closes.
  First instance: `/setup-foundation-architecture` v0.3.2 (anchor + 4
  cascading layer elicitations).

  ROLE-BOUNDARY MARKERS: when a workflow step loads a role or transitions
  to a different role, add structured HTML-comment markers around the
  step per the [role-boundary] Compass-original (see canon.md). Shape:

      <!-- COMPASS_ROLE_BOUNDARY: enter | role=<name> | workflow=<id> | step=<N> -->
      ...step content...
      <!-- COMPASS_ROLE_BOUNDARY: exit | role=<name> | workflow=<id> | step=<N> -->

  The markers are anchors for the reference parser at
  `compass/scripts/token-usage.py`, which attributes Claude Code session
  tokens to roles. Add markers when role transitions are meaningful
  (multi-role workflows like /build, /setup-product, /create-brief);
  optional for single-role workflows. PM-owned by convention.

  AGENT-HANDOFF: when a workflow routes work between AI agents (e.g.,
  Engineer implements → Reviewer reviews), document the handoff per the
  [agent-handoff] Compass-original (see canon.md) using the 5-piece shape:
  trigger artifact · trigger event · context window · output medium ·
  loop signal. If the handoff can be automated via CI (the common case
  for PR-based review), note the path: "if .github/workflows/ai-review.yml
  is installed (per compass/scripts/agent-handoff.yml), <reviewer> fires
  automatically on CI-green; otherwise <reviewer> is invoked manually."
  The manual path stays documented as fallback — automation is opt-in per
  consuming repo. Vendor CLI flags drift; sibling README of the template
  tracks `last_verified` per [freshness-check]. First instance: /build
  Phase 5 (Engineer → Codex via PR + GitHub Actions).
-->

### 1. <Step title>

**Precondition (GATE):** <concrete check>

**Work (Claude):** <what to do; specific output contract; named failure modes to avoid>

**Postcondition (GATE):** <verifiable output of this step>

### 2. <Step title>

**Precondition (GATE):** <…>

**Work (Claude):** <…>

**Postcondition (GATE):** <…>

## Verification (final GATE — workflow cannot complete until all checked)

<!--
  Mirrors every step's postcondition + workflow-wide invariants. Each line
  is [ ]; workflow is not complete until all pass.

  Cross-cutting principles must be referenced SPECIFICALLY (not generic
  citation):
  • #14 (soft-spec hardening) — point at the specific output where the
    constraint could be rationalized away; the verification item makes
    the constraint mechanically checkable.
  • #15 (cite-or-mark-n/a) — for any N-category structured consultation,
    require cite OR explicit n/a-with-reason per category; empty cells
    and unjustified n/a both fail.
  • #16 (refuse + escalate) — for any drift gate, the verification item
    confirms the refuse happened (not silently widened scope).
-->

- [ ] (Step <N>) <step postcondition mirrored>
- [ ] (Workflow invariant) <e.g., status: proposed before HITL>
- [ ] **HITL gate:** <human approval recorded, where applicable>. **Per Principle #16:** if any item above is unchecked, HITL cannot pass — refuse to proceed; tell user which item needs work.

Workflow is NOT complete until every item is checked.

## Output summary contract (mandatory to user)

<!--
  After completion (or refusal), report to user in this exact shape.
  Same shape as AGENTS.md principle #12 (structured, scannable responses).
  Don't deviate per workflow; consistency lets users skim.
-->

- **TL;DR** — 3 lines max; what shipped, current state, what's pending
- **Files created / modified** — table with file path + change type
- **Next recommended command** — one clear instruction
- **Open questions or risks** — only if applicable

## Notes

### Anti-patterns

<!--
  Named anti-patterns specific to this workflow. Naming primes future
  agents to recognize the failure mode; without a name, they re-discover
  the loophole fresh on every invocation (per principle #14 commentary).
-->

- **<name>** — <description of the specific failure mode>

### Edge cases

<!--
  Special flows that don't fit the main step sequence cleanly:
  amend mode, optional connectors, partial states, etc.
-->

- **<edge case name>** — <description + handling>

### Migration (if applicable)

<!--
  When this workflow is hardened or translated from an earlier version,
  note what changed structurally. Behavior changes (if any) MUST be
  called out explicitly; v0.3 hardening is structural-only by rule.
-->

- **<version range>** — <what changed and what was preserved>
