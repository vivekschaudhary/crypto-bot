## Summary

`[mechanical-output-verification]` (v0.3.6, 4th enforcement-class Compass-original) was codified across `compass/roles/reviewer.md` Step 0, `compass/workflows/build.md` Phase 2 step 7, `compass/framework/canon.md`, and `AGENTS.md`. All four Next.js anchors point at `.next/server/middleware-manifest.json` — correct for Next 13–15, **wrong for Next 16+**.

Next 16 relocated middleware/proxy registration to `.next/server/functions-config-manifest.json` (`/_middleware` entry with `runtime: "nodejs"` + matchers). The legacy `middleware-manifest.json` file still exists in 16.x but is **empty by design**. Checking the legacy file alone on Next 16 gives false negatives — looks like middleware is missing when it's actually registered in the new location.

This PR updates all four citations to lead with `functions-config-manifest.json` as the Next 16 primary anchor and retain `middleware-manifest.json` as a noted-legacy reference for pre-v16 stacks with the "empty by design on 16.x" caveat.

## Provenance

- v0.3.6 was authored against the aura-app CB-1.4 dashboard-proxy retrospective (which ran on a pre-Next-16 stack where `middleware-manifest.json` was still the load-bearing artifact).
- A parallel CB-1.4 cycle in a downstream Compass-consuming repo, on a Next 16 build chain, independently surfaced the same `polished-but-broken` pattern *and* identified the manifest relocation during its own BLOCKER closure.
- The downstream Codex reviewer then flagged the institutionalized-wrong-artifact during its v0.3.5 → v0.3.6 sync PR — which is the trigger for this upstream correction.

## Why this matters

`[mechanical-output-verification]`'s first-class job is closing the `polished-but-broken` gap (tests pass + build green + behavior wrong). Anchoring the Next.js check on an artifact that is **empty by design** on the current stable Next.js major reintroduces exactly that gap — reviewers either flag valid PRs as BLOCKER or, worse, learn to ignore the check entirely. The 4th enforcement-class member of the canon shouldn't be teaching the wrong place to look.

## Files changed

- `AGENTS.md` — `[mechanical-output-verification]` anchors paragraph
- `compass/framework/canon.md` — anchors list inside the canon entry
- `compass/roles/reviewer.md` — Step 0 Next.js bullet
- `compass/workflows/build.md` — Phase 2 step 7 Next.js bullet + `polished-but-broken` entry

Net diff: +5/-5 across the four files. No behavior change in workflows; pure citation correction.

## Test plan

- [ ] Read each patched section and confirm the Next 16 anchor leads and the pre-v16 anchor is retained as legacy with the "empty by design" caveat
- [ ] Spot-check that no other workflow or role doc cites `middleware-manifest.json` as a primary anchor for Next 16+ context
- [ ] Run compass-framework self-checks (markdown link validation, freshness checks) per CONTRIBUTING

🤖 Generated with [Claude Code](https://claude.com/claude-code)
