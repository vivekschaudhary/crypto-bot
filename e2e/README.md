# E2E Tests

End-to-end tests run by Playwright. **Owned by Codex** per Compass tool-division
(`AGENTS.md` — Codex writes E2E / automation; Engineer writes unit + integration
tests).

## Run

```bash
pnpm e2e          # one-shot run against dev server
pnpm e2e:ui       # interactive runner
```

Set `PLAYWRIGHT_BASE_URL=https://...` to run against a deployed preview/canary.
Set `PLAYWRIGHT_SKIP_WEB_SERVER=1` if the server is already running.

## First test to land

`e2e/auth/register.spec.ts` — passkey registration ceremony per CB-1.2 AC 8.

Use Playwright's virtual-authenticator API:

```ts
const cdpSession = await page.context().newCDPSession(page);
await cdpSession.send("WebAuthn.enable");
const { authenticatorId } = await cdpSession.send("WebAuthn.addVirtualAuthenticator", {
  options: {
    protocol: "ctap2",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
  },
});
```

Then drive the registration flow (UI lands in CB-1.6 — for CB-1.2 the spec
hits the endpoints directly OR uses a thin test harness page that calls
`navigator.credentials.create()`).
