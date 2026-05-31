// Happy-path tests for the verifyRegistrationResponse + verifyAuthenticationResponse
// wrappers. Closes CB-1.1 AC 5 gap (Codex BLOCKER #3 on PR #1) — proves the
// wrapper plumbing (RP ID + expected-origin derivation from APP_ORIGIN +
// options-object passthrough) works on the success path, not just failure.
//
// Scope deliberately limited: these tests mock @simplewebauthn/server so they
// exercise OUR wrapper code, not the underlying lib's cryptographic
// verification (which the lib's own test suite covers). End-to-end verification
// with real ceremony fixtures lands in CB-1.2 / CB-1.3 endpoint stories.

import { describe, expect, it, vi } from "vitest";
import {
  verifyAuthenticationResponse as libVerifyAuthenticationResponse,
  verifyRegistrationResponse as libVerifyRegistrationResponse,
} from "@simplewebauthn/server";

// env mock matches the one in webauthn.test.ts so RP ID derives to the
// production hostname for assertion stability.
vi.mock("@/lib/env", () => ({
  env: () => ({ SESSION_SIGNING_SECRET: "z".repeat(48) }),
  origin: () => "https://crypt-bot.kindtree.us",
}));

// Mock the SimpleWebAuthn lib in full. Factory is hoisted above this file's
// other top-level code, so the mocks must be created inline — they're
// retrievable via `vi.mocked()` below.
vi.mock("@simplewebauthn/server", () => ({
  generateRegistrationOptions: vi.fn(),
  generateAuthenticationOptions: vi.fn(),
  verifyRegistrationResponse: vi.fn(),
  verifyAuthenticationResponse: vi.fn(),
}));

import {
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@/lib/auth/webauthn";

describe("lib/auth/webauthn — verify wrappers (happy path)", () => {
  it("verifyRegistrationResponse returns the lib's verified result and passes derived origin + rpID", async () => {
    const successResult = {
      verified: true,
      registrationInfo: {
        credential: { id: "AAAA", publicKey: new Uint8Array([1, 2, 3]), counter: 0 },
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
      },
    };
    const libMock = vi.mocked(libVerifyRegistrationResponse);
    libMock.mockResolvedValueOnce(successResult as never);

    const result = await verifyRegistrationResponse({
      response: { id: "AAAA" } as never,
      expectedChallenge: "test-challenge-base64url",
    });

    expect(result).toBe(successResult);
    expect(libMock).toHaveBeenCalledTimes(1);
    const callArg = libMock.mock.calls[0]![0];
    expect(callArg.expectedOrigin).toBe("https://crypt-bot.kindtree.us");
    expect(callArg.expectedRPID).toBe("crypt-bot.kindtree.us");
    expect(callArg.expectedChallenge).toBe("test-challenge-base64url");
  });

  it("verifyAuthenticationResponse returns the lib's verified result and passes derived origin + rpID + credential", async () => {
    const stubCredential = { id: "BBBB", publicKey: new Uint8Array([9, 9]), counter: 7 };
    const successResult = {
      verified: true,
      authenticationInfo: {
        credentialID: "BBBB",
        newCounter: 8,
        userVerified: true,
        credentialDeviceType: "singleDevice",
        credentialBackedUp: false,
        origin: "https://crypt-bot.kindtree.us",
        rpID: "crypt-bot.kindtree.us",
      },
    };
    const libMock = vi.mocked(libVerifyAuthenticationResponse);
    libMock.mockResolvedValueOnce(successResult as never);

    const result = await verifyAuthenticationResponse({
      response: { id: "BBBB" } as never,
      expectedChallenge: "auth-challenge-base64url",
      credential: stubCredential,
    });

    expect(result).toBe(successResult);
    expect(libMock).toHaveBeenCalledTimes(1);
    const callArg = libMock.mock.calls[0]![0];
    expect(callArg.expectedOrigin).toBe("https://crypt-bot.kindtree.us");
    expect(callArg.expectedRPID).toBe("crypt-bot.kindtree.us");
    expect(callArg.expectedChallenge).toBe("auth-challenge-base64url");
    expect(callArg.credential).toBe(stubCredential);
  });
});
