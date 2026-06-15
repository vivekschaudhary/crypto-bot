import { expect, test } from "@playwright/test";

import { getTestSql } from "../test-db";

type RegistrationHarnessResult = {
  beginStatus: number;
  finishStatus: number;
  finishBody: { sessionId?: string; userId?: string; error?: string };
  error?: string;
};

type AuthenticationHarnessResult = {
  beginStatus: number;
  finishStatus: number;
  finishBody: { sessionId?: string; userId?: string; error?: string };
  error?: string;
};

type VirtualCredential = {
  credentialId: string;
  isResidentCredential: boolean;
  rpId: string;
  privateKey: string;
  signCount: number;
  userHandle?: string;
};

// Fail-closed against prod: getTestSql() uses TEST_DATABASE_URL and throws if
// it is unset or equals DATABASE_URL (see e2e/test-db.ts; 2026-06-15 incident).
const sql = getTestSql();

async function resetAuthTables(): Promise<void> {
  await sql`TRUNCATE auth_sessions, auth_credentials, auth_users RESTART IDENTITY CASCADE`;
}

async function authState(): Promise<{ counter: number; sessionCount: number }> {
  const [credential] = await sql<{ counter: number }[]>`
    SELECT counter::int AS counter
      FROM auth_credentials
     LIMIT 1
  `;
  const [sessions] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM auth_sessions`;

  return {
    counter: credential?.counter ?? 0,
    sessionCount: sessions?.count ?? 0,
  };
}

test.describe.configure({ mode: "serial" });

test.beforeEach(async () => {
  await resetAuthTables();
});

test.afterEach(async () => {
  await resetAuthTables();
});

test.afterAll(async () => {
  await sql.end({ timeout: 5 });
});

test("CB-1.3 AC 8: full passkey authentication ceremony rotates into exactly one session row", async ({
  context,
  page,
  baseURL,
}) => {
  await page.goto("/");

  const cdpSession = await context.newCDPSession(page);
  await cdpSession.send("WebAuthn.enable");

  const authenticatorOptions = {
    protocol: "ctap2",
    transport: "internal",
    hasResidentKey: true,
    hasUserVerification: true,
    isUserVerified: true,
    automaticPresenceSimulation: true,
  } as const;

  const { authenticatorId: seedAuthenticatorId } = await cdpSession.send("WebAuthn.addVirtualAuthenticator", {
    options: authenticatorOptions,
  });

  await page.evaluate(() => {
    const toBase64Url = (input: ArrayBuffer | ArrayBufferView): string => {
      const bytes =
        input instanceof ArrayBuffer
          ? new Uint8Array(input)
          : new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
      let binary = "";
      for (const byte of bytes) binary += String.fromCharCode(byte);
      return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    };

    const fromBase64Url = (value: string): ArrayBuffer => {
      const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
      const padded = normalized + "=".repeat((4 - (normalized.length % 4)) % 4);
      const binary = atob(padded);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
      return bytes.buffer;
    };

    const runRegister = async (): Promise<RegistrationHarnessResult> => {
      const beginResponse = await fetch("/api/auth/register/begin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ deviceLabel: "Playwright auth seed credential" }),
      });

      const beginStatus = beginResponse.status;
      const beginBody = await beginResponse.json();
      if (!beginResponse.ok) {
        return {
          beginStatus,
          finishStatus: -1,
          finishBody: beginBody,
        };
      }

      const options = beginBody.options;
      const credential = (await navigator.credentials.create({
        publicKey: {
          ...options,
          challenge: fromBase64Url(options.challenge),
          user: {
            ...options.user,
            id: fromBase64Url(options.user.id),
          },
          excludeCredentials: (options.excludeCredentials ?? []).map(
            (descriptor: { id: string; transports?: string[]; type: string }) => ({
              ...descriptor,
              id: fromBase64Url(descriptor.id),
            }),
          ),
        },
      })) as PublicKeyCredential | null;

      if (!credential) {
        throw new Error("navigator.credentials.create() returned null");
      }

      const response = credential.response as AuthenticatorAttestationResponse;
      const serializedResponse = {
        id: credential.id,
        rawId: toBase64Url(credential.rawId),
        response: {
          clientDataJSON: toBase64Url(response.clientDataJSON),
          attestationObject: toBase64Url(response.attestationObject),
          transports: typeof response.getTransports === "function" ? response.getTransports() : undefined,
          publicKeyAlgorithm:
            typeof response.getPublicKeyAlgorithm === "function" ? response.getPublicKeyAlgorithm() : undefined,
          publicKey:
            typeof response.getPublicKey === "function" && response.getPublicKey()
              ? toBase64Url(response.getPublicKey()!)
              : undefined,
          authenticatorData:
            typeof response.getAuthenticatorData === "function" && response.getAuthenticatorData()
              ? toBase64Url(response.getAuthenticatorData()!)
              : undefined,
        },
        type: credential.type,
        clientExtensionResults: credential.getClientExtensionResults(),
        authenticatorAttachment: credential.authenticatorAttachment,
      };

      const finishResponse = await fetch("/api/auth/register/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: serializedResponse }),
      });

      return {
        beginStatus,
        finishStatus: finishResponse.status,
        finishBody: await finishResponse.json(),
      };
    };

    const runAuthenticate = async (): Promise<AuthenticationHarnessResult> => {
      const beginResponse = await fetch("/api/auth/authenticate/begin", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({}),
      });

      const beginStatus = beginResponse.status;
      const beginBody = await beginResponse.json();
      if (!beginResponse.ok) {
        return {
          beginStatus,
          finishStatus: -1,
          finishBody: beginBody,
        };
      }

      const options = beginBody.options;
      const assertion = (await navigator.credentials.get({
        publicKey: {
          ...options,
          challenge: fromBase64Url(options.challenge),
          allowCredentials: (options.allowCredentials ?? []).map(
            (descriptor: { id: string; transports?: string[]; type: string }) => ({
              ...descriptor,
              id: fromBase64Url(descriptor.id),
            }),
          ),
        },
      })) as PublicKeyCredential | null;

      if (!assertion) {
        throw new Error("navigator.credentials.get() returned null");
      }

      const response = assertion.response as AuthenticatorAssertionResponse;
      const serializedResponse = {
        id: assertion.id,
        rawId: toBase64Url(assertion.rawId),
        response: {
          clientDataJSON: toBase64Url(response.clientDataJSON),
          authenticatorData: toBase64Url(response.authenticatorData),
          signature: toBase64Url(response.signature),
          userHandle: response.userHandle ? toBase64Url(response.userHandle) : undefined,
        },
        type: assertion.type,
        clientExtensionResults: assertion.getClientExtensionResults(),
        authenticatorAttachment: assertion.authenticatorAttachment,
      };

      const finishResponse = await fetch("/api/auth/authenticate/finish", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ response: serializedResponse }),
      });

      return {
        beginStatus,
        finishStatus: finishResponse.status,
        finishBody: await finishResponse.json(),
      };
    };

    const registerButton = document.createElement("button");
    registerButton.id = "pw-register-auth-seed";
    registerButton.textContent = "Seed auth credential";
    registerButton.addEventListener("click", async () => {
      try {
        (window as typeof window & { __registerAuthSeedResult?: RegistrationHarnessResult }).__registerAuthSeedResult =
          await runRegister();
      } catch (error) {
        (window as typeof window & { __registerAuthSeedResult?: RegistrationHarnessResult }).__registerAuthSeedResult =
          {
            beginStatus: -1,
            finishStatus: -1,
            finishBody: {},
            error: error instanceof Error ? error.message : String(error),
          };
      }
    });

    const authenticateButton = document.createElement("button");
    authenticateButton.id = "pw-authenticate";
    authenticateButton.textContent = "Run authentication";
    authenticateButton.addEventListener("click", async () => {
      try {
        (window as typeof window & { __authenticateResult?: AuthenticationHarnessResult }).__authenticateResult =
          await runAuthenticate();
      } catch (error) {
        (window as typeof window & { __authenticateResult?: AuthenticationHarnessResult }).__authenticateResult = {
          beginStatus: -1,
          finishStatus: -1,
          finishBody: {},
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    document.body.appendChild(registerButton);
    document.body.appendChild(authenticateButton);
  });

  await page.click("#pw-register-auth-seed");
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        return (window as typeof window & { __registerAuthSeedResult?: RegistrationHarnessResult })
          .__registerAuthSeedResult ?? null;
      });
    })
    .not.toBeNull();

  const registerResult = await page.evaluate(() => {
    return (window as typeof window & { __registerAuthSeedResult?: RegistrationHarnessResult })
      .__registerAuthSeedResult!;
  });

  expect(registerResult.error).toBeUndefined();
  expect(registerResult.beginStatus).toBe(200);
  expect(registerResult.finishStatus).toBe(200);

  const seededCredentialResult = (await cdpSession.send("WebAuthn.getCredentials", {
    authenticatorId: seedAuthenticatorId,
  })) as { credentials: VirtualCredential[] };
  expect(seededCredentialResult.credentials).toHaveLength(1);
  const seededCredential = seededCredentialResult.credentials[0]!;

  const beforeAuth = await authState();
  expect(beforeAuth.sessionCount).toBe(1);

  await page.click("#pw-authenticate");
  await expect
    .poll(async () => {
      return page.evaluate(() => {
        return (window as typeof window & { __authenticateResult?: AuthenticationHarnessResult }).__authenticateResult ?? null;
      });
    })
    .not.toBeNull();

  const authResult = await page.evaluate(() => {
    return (window as typeof window & { __authenticateResult?: AuthenticationHarnessResult }).__authenticateResult!;
  });

  expect(authResult.error).toBeUndefined();
  expect(authResult.beginStatus).toBe(200);
  expect(authResult.finishStatus).toBe(200);
  expect(authResult.finishBody.userId).toMatch(/^[0-9A-Z]{26}$/);
  expect(authResult.finishBody.sessionId).toMatch(/^[0-9A-Z]{26}$/);

  const cookies = await context.cookies(baseURL ? [baseURL] : undefined);
  const sessionCookie = cookies.find((cookie) => cookie.name === "__compass_session");
  expect(sessionCookie).toBeDefined();
  expect(sessionCookie?.value).toBeTruthy();

  await expect.poll(authState).toMatchObject({
    sessionCount: 1,
  });
  const afterAuth = await authState();
  expect(afterAuth.counter === 0 || afterAuth.counter > beforeAuth.counter).toBe(true);
  expect(afterAuth.sessionCount).toBe(1);

  // CDP import smoke-check: re-add the registered credential to a fresh
  // authenticator after the auth ceremony has completed. Chromium allows only
  // one `internal` authenticator at a time, so we import after the real flow
  // instead of before it.
  await cdpSession.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: seedAuthenticatorId });
  const { authenticatorId: replayAuthenticatorId } = await cdpSession.send("WebAuthn.addVirtualAuthenticator", {
    options: authenticatorOptions,
  });
  await cdpSession.send("WebAuthn.addCredential", {
    authenticatorId: replayAuthenticatorId,
    credential: seededCredential,
  });
  const replayCredentialResult = (await cdpSession.send("WebAuthn.getCredentials", {
    authenticatorId: replayAuthenticatorId,
  })) as { credentials: VirtualCredential[] };
  expect(replayCredentialResult.credentials).toHaveLength(1);
  expect(replayCredentialResult.credentials[0]?.credentialId).toBe(seededCredential.credentialId);

  await cdpSession.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId: replayAuthenticatorId });
});
