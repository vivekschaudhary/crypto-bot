#!/usr/bin/env bash
# Applies the Next 16 anchor correction to a checkout of vivekschaudhary/compass
# at v0.3.6. Run from the root of that checkout.
#
# Companion to docs/playbooks/upstream-compass-pr-next16-anchor.md in crypto-bot.
# The 4 replacements below are the CLEANED form (no crypto-bot-specific PR
# numbers inline — provenance lives in the PR description).

set -euo pipefail

if [[ ! -f AGENTS.md || ! -f compass/framework/canon.md || ! -f compass/roles/reviewer.md || ! -f compass/workflows/build.md ]]; then
  echo "FAIL: must run from the root of a compass-framework checkout (missing expected files)" >&2
  exit 1
fi

python3 <<'PYEOF'
import sys

REPLACEMENTS = {
    'AGENTS.md': [
        (
            r'Framework-specific anchors: Next.js manifests (`.next/server/middleware-manifest.json`, routes/app-paths/prerender); Vercel Functions',
            r'Framework-specific anchors: Next.js 16 (`.next/server/functions-config-manifest.json` — `/_middleware` entry; routes/app-paths/prerender manifests); pre-v16 Next (legacy `middleware-manifest.json` — empty by design on 16.x); Vercel Functions',
        ),
    ],
    'compass/framework/canon.md': [
        (
            r'Framework-specific anchors: **Next.js** (`.next/server/middleware-manifest.json`, `routes-manifest.json`, `app-paths-manifest.json`, `prerender-manifest.json`); **Vercel Functions**',
            r'Framework-specific anchors: **Next.js 16** (`.next/server/functions-config-manifest.json` — `/_middleware` entry registers middleware/proxy on Next 16+; `routes-manifest.json`, `app-paths-manifest.json`, `prerender-manifest.json`); **Pre-v16 Next** (legacy `.next/server/middleware-manifest.json` — empty by design in 16.x; cross-check with functions-config-manifest.json on 16+); **Vercel Functions**',
        ),
    ],
    'compass/roles/reviewer.md': [
        (
            r'   - **Next.js (middleware/routing/pages):** inspect `.next/server/middleware-manifest.json`, `routes-manifest.json`, `app-paths-manifest.json`, `prerender-manifest.json` — confirm the source declaration actually compiled into runtime config. Missing entries = framework silently dropped the file.',
            r'   - **Next.js 16 (middleware/proxy/routing/pages):** inspect **`.next/server/functions-config-manifest.json`** (look for the `/_middleware` entry with `runtime: "nodejs"` + matchers — this is where Next 16 registers middleware/proxy), `routes-manifest.json`, `app-paths-manifest.json`, `prerender-manifest.json` — confirm the source declaration actually compiled into runtime config. Missing entries = framework silently dropped the file. **Pre-v16 (Next 13–15):** the legacy artifact was `.next/server/middleware-manifest.json`; that file still exists in 16.x but is **empty by design** in Next 16 — checking the legacy file ALONE on Next 16 gives false negatives (looks like middleware is missing when it\'s actually registered in the new location). Always cross-check against `functions-config-manifest.json` for routing-layer registration on Next 16+.',
        ),
    ],
    'compass/workflows/build.md': [
        (
            r'   - **Next.js:** read `.next/server/middleware-manifest.json` — confirm middleware paths are present; missing entries = middleware silently dropped at build time despite the source declaring it. Same shape for `routes-manifest.json` (route definitions), `app-paths-manifest.json` / `pages-manifest.json` (page/route inclusion), and `prerender-manifest.json` (ISR / SSG correctness).',
            r'   - **Next.js 16:** read **`.next/server/functions-config-manifest.json`** — confirm the `/_middleware` entry exists with `runtime: "nodejs"` + matchers; that\'s where Next 16 registers middleware/proxy. Missing entry = middleware silently dropped at build time despite the source declaring it. **Pre-v16 (Next 13–15):** the legacy artifact was `.next/server/middleware-manifest.json`; on Next 16 that file is **empty by design** — checking the legacy file alone gives false negatives. Same OUTPUT vs PROCESS check for `routes-manifest.json` (route definitions), `app-paths-manifest.json` / `pages-manifest.json` (page/route inclusion), and `prerender-manifest.json` (ISR / SSG correctness).',
        ),
        (
            r'First observed: aura-app CB-1.4 dashboard proxy (2026-06-01) — middleware-manifest.json check revealed the gap between source intent and runtime config.',
            r'First observed: aura-app CB-1.4 dashboard proxy (2026-06-01) — manifest check revealed the gap between source intent and runtime config. A parallel cycle on a Next 16 stack independently surfaced the same pattern and identified that on Next 16 the load-bearing manifest moved from `middleware-manifest.json` to `functions-config-manifest.json` — the subsequent anchor correction in this entry comes from that finding.',
        ),
    ],
}

failures = []
for path, pairs in REPLACEMENTS.items():
    with open(path, 'r', encoding='utf-8') as f:
        content = f.read()
    original = content
    for old, new in pairs:
        if old not in content:
            failures.append(f'{path}: old string not found')
            continue
        if content.count(old) > 1:
            failures.append(f'{path}: old string matches {content.count(old)} times — refusing (would be ambiguous)')
            continue
        content = content.replace(old, new)
    if content != original:
        with open(path, 'w', encoding='utf-8') as f:
            f.write(content)
        print(f'OK: {path}')
    else:
        print(f'NO-CHANGE: {path}')

if failures:
    print('', file=sys.stderr)
    print('FAILURES:', file=sys.stderr)
    for f in failures:
        print(f'  - {f}', file=sys.stderr)
    print('', file=sys.stderr)
    print('The script aborted some replacements. Common causes:', file=sys.stderr)
    print('  - upstream main has drifted since v0.3.6 (re-pull and re-check)', file=sys.stderr)
    print('  - this script has already been applied (idempotent — safe to ignore if intentional)', file=sys.stderr)
    sys.exit(1)

print('')
print('All replacements applied. Verify with: git diff --stat && git diff')
PYEOF
