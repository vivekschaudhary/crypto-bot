<!--
Canonical PR template content. Copied to .github/PULL_REQUEST_TEMPLATE.md
(GitHub doesn't follow references — so we concatenate, not link).
-->

> **⛔ DO NOT MERGE** until **Codex Code Review** has posted on this PR, **Codex Security Review** has posted (auto-triggered if the diff touches auth, PII, payments, secrets, sessions, external input, or crypto), and **all Codex BLOCKERs are resolved or formally disputed**. The Compass workflow's Phase 6 (HITL merge) cannot fire before Phase 5 (review) is complete — this PR was the slip we're hardening against (see [CB-1.1.1](docs/bets/CB-1/stories/CB-1.1.1/story.md)).

## Summary

<One paragraph: what changed and why.>

## Linked artifacts

- Bet: `docs/bets/<bet-id>/brief.md`
- Architecture: `docs/bets/<bet-id>/architecture.md` (if exists)
- Story: `docs/bets/<bet-id>/stories/<story-id>/story.md`
- Design: `docs/bets/<bet-id>/stories/<story-id>/design.md` (if UI)
- Copy: `docs/bets/<bet-id>/stories/<story-id>/copy.md` (if UI)
- Ticket: <Jira/Linear link>

## Changes per area

### Frontend
<What changed, behavior delta.>

### Backend
<What changed, behavior delta.>

### Other (ops, infra, contracts)
<What changed.>

## Test plan

- [ ] Unit tests added/updated
- [ ] API tests added/updated
- [ ] Component tests added/updated (frontend)
- [ ] E2E tests added/updated (Codex)
- [ ] All tests pass locally
- [ ] Accessibility checks pass (if UI)
- [ ] Manual verification: <what was checked>

## Review handoff

**Engineer (Claude or other):** Implementation complete per bet architecture. Codex should review per `compass/roles/reviewer.md`.

**Reviewer (Codex):** Read `AGENTS.md`, this bet's architecture and brief, then review this diff. Architect compliance check included. Post structured findings per the format in `compass/roles/reviewer.md`.

**Security review:** auto-triggered if diff touches auth, PII, payments, secrets, external input, sessions, or crypto. Per `compass/roles/security-reviewer.md`.

## Dispute (optional)

<If Engineer believes a Reviewer finding is wrong, add reasoning here. PM arbitrates.>

## Pre-merge checklist (mechanically enforced)

- [ ] CI green
- [ ] Tech design approved (or change is exempt)
- [ ] Reviewer findings: all BLOCKERs addressed
- [ ] Security CRITICAL findings: zero
- [ ] Disputes: zero unresolved
- [ ] Human approval recorded
