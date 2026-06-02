# Upstream Compass PR — Next 16 anchor correction for `[mechanical-output-verification]`

**Status:** FIRED 2026-06-01 as upstream PR https://github.com/vivekschaudhary/compass/pull/1 (commit `24257f5` on upstream branch `fix/mechanical-output-next16-anchor`). Awaiting upstream merge. After upstream merge, the next compass-framework sync into crypto-bot should remove the local inline credit parentheticals from the four patched files (`AGENTS.md`, `compass/framework/canon.md`, `compass/roles/reviewer.md`, `compass/workflows/build.md`) — see "How to fire" section below.
**Target repo:** `vivekschaudhary/compass` (the compass-framework remote).
**Source commit:** `43dce7f` on crypto-bot branch `chore/sync-compass-framework-v0.3.6` (since merged via PR #12).

## Why this PR exists

Upstream Compass v0.3.6 codified `[mechanical-output-verification]` (4th enforcement-class Compass-original) and applied it across `compass/roles/reviewer.md` Step 0, `compass/workflows/build.md` Phase 2 step 7, `compass/framework/canon.md`, and `AGENTS.md`. Every Next.js anchor in those four files cites `.next/server/middleware-manifest.json`.

That artifact is the correct anchor for Next 13–15 but **wrong for Next 16**, which is the version the pattern was authored *during*. Next 16 relocated middleware/proxy registration to `.next/server/functions-config-manifest.json` (the `/_middleware` entry with `runtime: "nodejs"` + matchers). The legacy `middleware-manifest.json` still exists in 16.x but is **empty by design** — checking it alone on a 16+ stack gives false negatives (looks like middleware is missing when it's actually registered in the new location).

The miss came from cadence: v0.3.6 was authored against the aura-app CB-1.4 dashboard-proxy retrospective. The crypto-bot CB-1.4 cycle (same pattern, same retro, but on an earlier Next 16 build chain) independently surfaced the manifest relocation and the project's Codex reviewer flagged the institutionalized-wrong-artifact during downstream PR #12 (sync of v0.3.5 → v0.3.6 into crypto-bot).

Without this correction, every consuming repo on Next 16+ that follows v0.3.6's framework-registration check will inspect an empty file, conclude nothing is registered, and either (a) flag valid PRs as BLOCKER or (b) — worse — learn to ignore the check entirely. The pattern's first-class job is closing the `polished-but-broken` gap; institutionalizing the wrong artifact reintroduces it.

## PR title

```
fix: cite functions-config-manifest.json as Next 16 anchor for [mechanical-output-verification]
```

## PR description

```markdown
## Summary

`[mechanical-output-verification]` (v0.3.6, 4th enforcement-class Compass-original) was codified across reviewer.md Step 0, build.md Phase 2 step 7, canon.md, and AGENTS.md. All four Next.js anchors point at `.next/server/middleware-manifest.json` — correct for Next 13–15, wrong for Next 16+.

Next 16 relocated middleware/proxy registration to `.next/server/functions-config-manifest.json` (`/_middleware` entry with `runtime: "nodejs"` + matchers). The legacy `middleware-manifest.json` file still exists in 16.x but is **empty by design**. Checking the legacy file alone on Next 16 gives false negatives — looks like middleware is missing when it's actually registered in the new location.

This PR updates all four citations to lead with `functions-config-manifest.json` as the Next 16 primary anchor and retain `middleware-manifest.json` as a noted-legacy reference for pre-v16 stacks with the "empty by design on 16.x" caveat.

## Provenance

- v0.3.6 was authored against the aura-app CB-1.4 dashboard-proxy retrospective.
- Crypto-bot CB-1.4 (same pattern, parallel cycle on earlier Next 16 build chain) independently surfaced the manifest relocation during PR #10's BLOCKER closure, then its Codex reviewer flagged the institutionalized-wrong-artifact during the v0.3.5 → v0.3.6 sync PR (#12).
- This PR upstreams that correction so downstream syncs don't re-introduce the drift.

## Why this matters

`[mechanical-output-verification]`'s first-class job is closing the `polished-but-broken` gap (tests pass + build green + behavior wrong). Anchoring the Next.js check on an artifact that is empty by design on the current stable Next.js major reintroduces exactly that gap — reviewers either flag valid PRs as BLOCKER or learn to ignore the check, which is worse.

## Files changed

- `AGENTS.md` — `[mechanical-output-verification]` anchors paragraph
- `compass/framework/canon.md` — anchors list inside the canon entry
- `compass/roles/reviewer.md` — Step 0 Next.js bullet
- `compass/workflows/build.md` — Phase 2 step 7 Next.js bullet + `polished-but-broken` entry

Net diff: +5/-5 across the four files. No behavior change in workflows; pure citation correction.

## Test plan

- [ ] Read each patched section and confirm the Next 16 anchor leads and pre-v16 anchor is retained as legacy with the "empty by design" caveat
- [ ] Spot-check that no other workflow or role doc cites `middleware-manifest.json` as a primary anchor
- [ ] Run any compass-framework self-checks (markdown link validation, freshness checks) per CONTRIBUTING

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

## Patches to apply

Apply on top of `vivekschaudhary/compass` `main` at v0.3.6. The downstream commit `43dce7f` is the diff-source — but the inline parentheticals that reference "crypto-bot Codex review of PR #12" in the downstream commit should be **stripped** for upstream (the provenance lives in the PR description, not in the framework docs).

### 1. `AGENTS.md` — `[mechanical-output-verification]` paragraph

Find the sentence beginning `Framework-specific anchors: Next.js manifests`. Replace:

```
Framework-specific anchors: Next.js manifests (`.next/server/middleware-manifest.json`, routes/app-paths/prerender); Vercel Functions (`.vercel/output/functions/`); Expo prebuild native config + bundle.
```

with:

```
Framework-specific anchors: Next.js 16 (`.next/server/functions-config-manifest.json` — `/_middleware` entry; routes/app-paths/prerender manifests); pre-v16 Next (legacy `middleware-manifest.json` — empty by design on 16.x); Vercel Functions (`.vercel/output/functions/`); Expo prebuild native config + bundle.
```

### 2. `compass/framework/canon.md` — `### mechanical-output-verification` entry

Find `Framework-specific anchors: **Next.js**`. Replace:

```
Framework-specific anchors: **Next.js** (`.next/server/middleware-manifest.json`, `routes-manifest.json`, `app-paths-manifest.json`, `prerender-manifest.json`); **Vercel Functions** (`.vercel/output/functions/`); **Expo** (prebuild native config + bundle);
```

with:

```
Framework-specific anchors: **Next.js 16** (`.next/server/functions-config-manifest.json` — `/_middleware` entry registers middleware/proxy on Next 16+; `routes-manifest.json`, `app-paths-manifest.json`, `prerender-manifest.json`); **Pre-v16 Next** (legacy `.next/server/middleware-manifest.json` — empty by design in 16.x; cross-check with functions-config-manifest.json on 16+); **Vercel Functions** (`.vercel/output/functions/`); **Expo** (prebuild native config + bundle);
```

### 3. `compass/roles/reviewer.md` — Step 0 Next.js bullet

Find `- **Next.js (middleware/routing/pages):** inspect`. Replace the entire bullet:

```
   - **Next.js (middleware/routing/pages):** inspect `.next/server/middleware-manifest.json`, `routes-manifest.json`, `app-paths-manifest.json`, `prerender-manifest.json` — confirm the source declaration actually compiled into runtime config. Missing entries = framework silently dropped the file.
```

with:

```
   - **Next.js 16 (middleware/proxy/routing/pages):** inspect **`.next/server/functions-config-manifest.json`** (look for the `/_middleware` entry with `runtime: "nodejs"` + matchers — this is where Next 16 registers middleware/proxy), `routes-manifest.json`, `app-paths-manifest.json`, `prerender-manifest.json` — confirm the source declaration actually compiled into runtime config. Missing entries = framework silently dropped the file. **Pre-v16 (Next 13–15):** the legacy artifact was `.next/server/middleware-manifest.json`; that file still exists in 16.x but is **empty by design** in Next 16 — checking the legacy file ALONE on Next 16 gives false negatives (looks like middleware is missing when it's actually registered in the new location). Always cross-check against `functions-config-manifest.json` for routing-layer registration on Next 16+.
```

### 4. `compass/workflows/build.md` — Phase 2 step 7 Next.js bullet + polished-but-broken entry

**Bullet (~line 46):** find `- **Next.js:** read \`.next/server/middleware-manifest.json\``. Replace:

```
   - **Next.js:** read `.next/server/middleware-manifest.json` — confirm middleware paths are present; missing entries = middleware silently dropped at build time despite the source declaring it. Same shape for `routes-manifest.json` (route definitions), `app-paths-manifest.json` / `pages-manifest.json` (page/route inclusion), and `prerender-manifest.json` (ISR / SSG correctness).
```

with:

```
   - **Next.js 16:** read **`.next/server/functions-config-manifest.json`** — confirm the `/_middleware` entry exists with `runtime: "nodejs"` + matchers; that's where Next 16 registers middleware/proxy. Missing entry = middleware silently dropped at build time despite the source declaring it. **Pre-v16 (Next 13–15):** the legacy artifact was `.next/server/middleware-manifest.json`; on Next 16 that file is **empty by design** — checking the legacy file alone gives false negatives. Same OUTPUT vs PROCESS check for `routes-manifest.json` (route definitions), `app-paths-manifest.json` / `pages-manifest.json` (page/route inclusion), and `prerender-manifest.json` (ISR / SSG correctness).
```

**Polished-but-broken entry (~line 51):** find the sentence ending `First observed: aura-app CB-1.4 dashboard proxy (2026-06-01) — middleware-manifest.json check revealed the gap between source intent and runtime config.` Replace that single sentence with:

```
First observed: aura-app CB-1.4 dashboard proxy (2026-06-01) — manifest check revealed the gap between source intent and runtime config. A parallel cycle on a Next 16 stack independently surfaced the same pattern and identified that on Next 16 the load-bearing manifest moved from `middleware-manifest.json` to `functions-config-manifest.json` — the v0.3.6 → v0.3.7 anchor correction in this canon entry comes from that finding.
```

(Note: do **not** include the crypto-bot PR #10 / PR #12 references inline — those are downstream-specific and belong in the upstream PR description, not the framework doc.)

## How to fire

Once crypto-bot PR #12 merges:

1. Clone or fetch `vivekschaudhary/compass`, branch from `main`.
2. Apply the 4 patches above (cleaned-up versions — NOT a raw cherry-pick of `43dce7f`, which has crypto-bot-specific credit lines).
3. Open PR with the title + description above.
4. After upstream merge, the next compass-framework sync into crypto-bot will pick up the clean version; crypto-bot's local credit lines in the same 4 files should be **removed** in that sync commit (they're already in this playbook + the original PR #12, no need to keep them in the framework docs).

## Why not just cherry-pick `43dce7f`?

Two reasons:

1. **The inline parentheticals** (`(This anchor correction was surfaced by crypto-bot Codex review of PR #12...)` in reviewer.md, and `The crypto-bot CB-1.4 cycle independently surfaced...` in build.md) reference downstream PR numbers that mean nothing to other consumers of the framework. They belong in the upstream PR description as provenance, not in the framework documentation as inline text.
2. **Cherry-pick + edit-down** is more error-prone than apply-from-spec. The patches above are the canonical cleaned version.
