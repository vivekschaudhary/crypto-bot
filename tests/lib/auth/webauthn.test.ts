import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({
  env: () => ({ SESSION_SIGNING_SECRET: "z".repeat(48) }),
  origin: () => "https://crypt-bot.kindtree.us",
}));

import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from "@/lib/auth/webauthn";

describe("lib/auth/webauthn", () => {
  it("generateRegistrationOptions returns options with the RP ID derived from APP_ORIGIN", async () => {
    const opts = await generateRegistrationOptions({
      userId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      userName: "operator",
    });
    expect(opts.rp.id).toBe("crypt-bot.kindtree.us");
    expect(opts.rp.name).toBe("Crypto DCA Bot");
    expect(opts.user.name).toBe("operator");
    expect(opts.challenge).toBeDefined();
    expect(opts.pubKeyCredParams.length).toBeGreaterThan(0);
  });

  it("generateRegistrationOptions excludes credentials when provided", async () => {
    const opts = await generateRegistrationOptions({
      userId: "01ARZ3NDEKTSV4RRFFQ69G5FAV",
      userName: "operator",
      excludeCredentials: [{ id: "AAAA" }, { id: "BBBB" }],
    });
    expect(opts.excludeCredentials?.length).toBe(2);
  });

  it("generateAuthenticationOptions returns options scoped to our RP ID", async () => {
    const opts = await generateAuthenticationOptions();
    expect(opts.rpId).toBe("crypt-bot.kindtree.us");
    expect(opts.challenge).toBeDefined();
  });

  it("generateAuthenticationOptions respects allowCredentials", async () => {
    const opts = await generateAuthenticationOptions({
      allowCredentials: [{ id: "CCCC" }],
    });
    expect(opts.allowCredentials?.length).toBe(1);
  });

  it("generateAuthenticationOptions preserves a caller-minted base64url challenge", async () => {
    const challenge = "AQIDBAUGBwgJCgsMDQ4PEA";
    const opts = await generateAuthenticationOptions({ challenge });
    expect(opts.challenge).toBe(challenge);
  });

  it("verifyRegistrationResponse returns verified: false for a tampered/empty response", async () => {
    // Pass an obviously-bogus response. SimpleWebAuthn either throws (which
    // we catch and treat as not-verified) or returns verified:false.
    const bogusResponse = {
      id: "AAAA",
      rawId: "AAAA",
      response: {
        clientDataJSON: "AAAA",
        attestationObject: "AAAA",
      },
      type: "public-key",
      clientExtensionResults: {},
    };
    let verified = true;
    try {
      const result = await verifyRegistrationResponse({
        response: bogusResponse as never,
        expectedChallenge: "not-a-real-challenge",
      });
      verified = result.verified;
    } catch {
      verified = false;
    }
    expect(verified).toBe(false);
  });

  it("verifyAuthenticationResponse returns verified: false for a tampered/empty response", async () => {
    const bogusResponse = {
      id: "AAAA",
      rawId: "AAAA",
      response: {
        clientDataJSON: "AAAA",
        authenticatorData: "AAAA",
        signature: "AAAA",
        userHandle: "AAAA",
      },
      type: "public-key",
      clientExtensionResults: {},
    };
    const bogusCredential = {
      id: "AAAA",
      publicKey: new Uint8Array([0]),
      counter: 0,
    };
    let verified = true;
    try {
      const result = await verifyAuthenticationResponse({
        response: bogusResponse as never,
        expectedChallenge: "not-a-real-challenge",
        credential: bogusCredential,
      });
      verified = result.verified;
    } catch {
      verified = false;
    }
    expect(verified).toBe(false);
  });
});
