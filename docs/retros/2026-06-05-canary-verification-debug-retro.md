---
id: retro-canary-verification-debug-2026-06-05
type: retro
status: complete
date: 2026-06-05
author: Claude (post-incident self-retro)
scope: process
subject: Why CB-1 canary verification took ~4 hours when the actual root cause was a 2-minute SQL fix
verdict: Five compounding failure modes — display-message masquerade, anchoring bias, environment-typo I introduced earlier, two-directory drift, unreliable Edit tool — turned a 5-minute setup ceremony into a multi-hour debug. The single diagnostic step that would have ended the loop in ~10 minutes ("Network tab → click failed request → Response body") was not requested until ~3 hours in.
---

# Canary verification debug retro (2026-06-05)

## What happened (timeline)

The operator wanted to verify CB-1 end-to-end on the production canary by completing a fresh-instance passkey setup ceremony at `https://crypto-bot.kindtree.us`. Expected duration: 5 minutes.

Actual duration: **~4 hours.** Token spend: large.

The five phases:

| Phase | Duration | Activity | Real root cause |
|---|---|---|---|
| 1. Env-var setup | ~30 min | Adding SESSION_SIGNING_SECRET, RECOVERY_CODE_PEPPER, DATABASE_URL, etc. to Vercel | Genuine setup work; legitimate time |
| 2. DB connection debug | ~30 min | Supabase pooler URL format (username, port, region, TLS) | Genuine setup work; legitimate time |
| 3. APP_ORIGIN typo loop | ~90 min | Setting APP_ORIGIN, redeploying, still getting 403 "Setup blocked" | **MISDIRECTED** — the 403 was NOT from origin-check |
| 4. Logging / build / dir confusion | ~60 min | Debug branch, console.warn, Vercel logs empty, two directories | **MISDIRECTED** — same root cause |
| 5. Resolution | ~5 min | Look at response body → `registration-disabled` → also DELETE FROM auth_users | **5 minutes once we asked the right question** |

The first two phases were unavoidable. **Phases 3 and 4 (~2.5 hours) were entirely avoidable** with one diagnostic step that should have happened in the first 10 minutes.

## The single question that would have saved 2.5 hours

> **"Open Browser DevTools → Network tab → click the failed `begin` request → Response panel. What's the body?"**

When the operator finally pasted `{"error":"registration-disabled"}`, the diagnosis was obvious in 30 seconds: the route handler returns **HTTP 403** with `registration-disabled` body when `auth_users` has a row, AND the client-side error mapping treats ALL 403s as `"origin-mismatch"` → display copy "Setup blocked: this page must run on the deployed instance, not a local copy."

The "Setup blocked" display message was misleading. **Two completely different server-side conditions render the same client-side error.**

## Root causes (named)

### 1. Display-message masquerade (real code bug)

`app/setup/setup-client.tsx:errorKeyForResponse` maps:
```ts
if (status === 403) return "origin-mismatch";
```

But `app/api/auth/register/begin/route.ts` returns 403 from two distinct paths:
- Line 83: `verifyOriginOrThrow` catch → 403 `{ error: "origin-mismatch" }`
- Line 105: First-time-only gate → 403 `{ error: "registration-disabled" }`

Both surface in the browser as the same `"origin-mismatch"` typed message. This is a soft-spec failure (AGENTS.md principle #14): the client mapping implicitly assumed "403 = origin-mismatch" but the route grew a second 403 path later. **Real bug to fix in a follow-up `/fix` PR.**

### 2. Anchoring bias (me)

Once I read "Setup blocked: this page must run on the deployed instance, not a local copy." I fixated on the origin-check as the root cause and never seriously interrogated the premise. Every iteration was "check env, redeploy, check again." I didn't ask "what if the 403 isn't from origin-check at all?" until forced by the response body evidence.

**The cost of being wrong about premise compounds over iterations.** I should have re-examined the assumption every ~15 minutes of unproductive debugging.

### 3. Environment typo I introduced earlier (real bug I propagated)

`compass/config.yaml`'s `canary_artifacts[].url` was set to `https://crypt-bot.kindtree.us` (no 'o') somewhere in the foundational architecture work. The actual deployed Vercel domain was `crypto-bot.kindtree.us` (with 'o'). I worked off the typo for the entire session, telling the operator the URL was the no-'o' version. The operator updated `APP_ORIGIN` to match my (wrong) value, then later we caught the typo and switched it. Several hours of debug worked against the wrong domain.

This was an actively counterproductive error on my part. **The fix already exists** ([this retro itself](#) + the env update); a follow-up `/ops` PR should clean up the `compass/config.yaml` + brief.md + test mocks to use the correct hostname.

### 4. Two-directory drift (collaboration artifact)

The operator has two crypto-app working trees on their machine:
- `/Users/vivekchaudhary/apps/crypto-app` — where I was making debug commits
- `/Volumes/Vivek mac/apps/crypto-app` — where the operator's terminal actually lived (shell cwd kept resetting to this on every Bash tool call)

My git commits landed in `/Users/...`, but `vercel --prod --force` ran from `/Volumes/...`. The deployments were from a tree that didn't have my debug code. I didn't catch this until many iterations later.

**Hard lesson:** when the shell cwd doesn't match the work cwd, debug iterations are silently against wrong source. Should have verified deployment source matches local edits via dashboard check **before** every redeploy.

### 5. Edit-tool unreliability (tooling)

Multiple times in this session, the Edit tool reported success but the changes did NOT persist to disk. `git status` showed "nothing to commit" even after Edit succeeded. The `console.log` calls I "committed" weren't actually on the file system. I didn't catch this until late in the session when verifying with `grep` after `cat`-style commands instead of trusting Edit tool's success reports.

**Workaround used:** `perl -i -pe` direct edits + verify with `grep` immediately after. More reliable than Edit tool for this session.

## What I could have done in 10 minutes instead of 4 hours

1. **First 5 minutes:** "Open DevTools → Network → click the failing request → Response tab → paste the body." (The operator's actual answer in step 5.)
2. **Next 2 minutes:** Recognize `{"error":"registration-disabled"}` as the first-time-only gate.
3. **Next 3 minutes:** Wipe `auth_users` (the missing DELETE in the runbook), wait 60s for the cache, retry. Done.

The fact that the operator saw "Setup blocked..." in the browser was a complete red herring — that display text is what the client emits for ANY 403, regardless of cause.

## Compounding context: previous correct intuitions made wrong by display drift

Earlier in the session I correctly suspected:
- `APP_ORIGIN` env value (real possibility, worth checking once)
- Deployment serving the wrong build (real possibility, worth checking once)
- DNS issues (legitimate side concern)
- Vercel SSO / deployment protection (briefly considered, dismissed correctly)

Each of these took ~30 minutes to investigate + dismiss. **The compounding cost was the iteration loop**, not any single hypothesis being unreasonable. With the right diagnostic step first, we'd have skipped all of them.

## Action items (queued)

| Severity | Action | Where |
|---|---|---|
| Real bug | `register/begin` returns 403 with `registration-disabled` body but should be **409** (Conflict). Other registration-conflict paths in the codebase already use 409. | New `/fix` PR |
| Real bug | `setup-client.tsx` error mapping should disambiguate 403s by reading response body's `error` field, not just status. Otherwise the masquerade re-traps future debuggers. | Same `/fix` PR |
| Real bug | `docs/ops/runbook.md` § "Lost all passkeys AND lost the backup code" SQL is incomplete — needs `DELETE FROM auth_users;` after the existing three DELETEs. Without this, the documented runbook recovery procedure literally cannot succeed. | Small `/ops` PR |
| Cleanup | Fix the `crypt-bot.kindtree.us` (no 'o') typo across `compass/config.yaml`, `docs/bets/CB-1/brief.md`, and the ~20 test files that hardcode the wrong hostname. | Same `/ops` PR |
| Process | When debugging 4xx/5xx, **always** request response body before iterating on hypotheses. | Saved as feedback memory at `feedback_403_registration_disabled_masquerade.md` |
| Process | When using Edit tool for code changes, immediately verify with `grep` or `cat`; don't trust the tool's success report alone if subsequent git operations behave unexpectedly. | Personal note; not a project artifact |
| Process | When operator's shell cwd doesn't match where I'm editing, surface this immediately and either change my workdir or change theirs. | Personal note |

## Verdict

The debug was avoidable. The single largest mistake was anchoring on "this is an APP_ORIGIN issue" without asking for the response body within the first 10 minutes. The contributing display-message masquerade is a real code bug that should be fixed before it bites the operator again.

The genuine work in phases 1 and 2 (env setup, DB connection) was legitimate. Phases 3 and 4 were almost entirely my failure to interrogate the premise.

I'm sorry for the burned time. The code bugs identified are real and will get fixed as small follow-up PRs.
