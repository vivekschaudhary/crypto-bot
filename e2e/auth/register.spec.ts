import { expect, test } from "@playwright/test";

import { getTestSql } from "../test-db";

type RegistrationHarnessResult = {
  beginStatus: number;
  finishStatus: number;
  finishBody: { sessionId?: string; userId?: string; error?: string };
  error?: string;
};

// Fail-closed against prod: getTestSql() uses TEST_DATABASE_URL and throws if
// it is unset or equals DATABASE_URL (see e2e/test-db.ts; 2026-06-15 incident).
const sql = getTestSql();

async function resetAuthTables(): Promise<void> {
  await sql`TRUNCATE auth_sessions, auth_credentials, auth_users RESTART IDENTITY CASCADE`;
}

async function authRowCounts(): Promise<{ users: number; credentials: number; sessions: number }> {
  const [users] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM auth_users`;
  const [credentials] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM auth_credentials`;
  const [sessions] = await sql<{ count: number }[]>`SELECT count(*)::int AS count FROM auth_sessions`;

  return {
    users: users?.count ?? 0,
    credentials: credentials?.count ?? 0,
    sessions: sessions?.count ?? 0,
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

test("CB-1.2 AC 8: full passkey registration ceremony sets session cookie and persists auth rows", async ({
  context,
  page,
  baseURL,
}) => {
  await page.goto("/");

  const cdpSession = await context.newCDPSession(page);
  await cdpSession.send("WebAuthn.enable");
  const { authenticatorId } = await cdpSession.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });

  await page.evaluate(() => {
    const button = document.createElement("button");
    button.id = "pw-register";
    button.textContent = "Run passkey registration";

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

    button.addEventListener("click", async () => {
      try {
        const beginResponse = await fetch("/api/auth/register/begin", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ deviceLabel: "Playwright virtual authenticator" }),
        });

        const beginStatus = beginResponse.status;
        const beginBody = await beginResponse.json();
        if (!beginResponse.ok) {
          (window as typeof window & { __registerResult?: RegistrationHarnessResult }).__registerResult = {
            beginStatus,
            finishStatus: -1,
            finishBody: beginBody,
          };
          return;
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

        const finishBody = await finishResponse.json();
        (window as typeof window & { __registerResult?: RegistrationHarnessResult }).__registerResult = {
          beginStatus,
          finishStatus: finishResponse.status,
          finishBody,
        };
      } catch (error) {
        (window as typeof window & { __registerResult?: RegistrationHarnessResult }).__registerResult = {
          beginStatus: -1,
          finishStatus: -1,
          finishBody: {},
          error: error instanceof Error ? error.message : String(error),
        };
      }
    });

    document.body.appendChild(button);
  });

  await page.click("#pw-register");

  await expect
    .poll(async () => {
      return page.evaluate(() => {
        return (window as typeof window & { __registerResult?: RegistrationHarnessResult }).__registerResult ?? null;
      });
    })
    .not.toBeNull();

  const result = await page.evaluate(() => {
    return (window as typeof window & { __registerResult?: RegistrationHarnessResult }).__registerResult!;
  });

  expect(result.error).toBeUndefined();
  expect(result.beginStatus).toBe(200);
  expect(result.finishStatus).toBe(200);
  expect(result.finishBody.userId).toMatch(/^[0-9A-Z]{26}$/);
  expect(result.finishBody.sessionId).toMatch(/^[0-9A-Z]{26}$/);

  const cookies = await context.cookies(baseURL ? [baseURL] : undefined);
  const sessionCookie = cookies.find((cookie) => cookie.name === "__compass_session");
  expect(sessionCookie).toBeDefined();
  expect(sessionCookie?.value).toBeTruthy();

  await expect.poll(authRowCounts).toEqual({
    users: 1,
    credentials: 1,
    sessions: 1,
  });

  await cdpSession.send("WebAuthn.removeVirtualAuthenticator", { authenticatorId });
});
