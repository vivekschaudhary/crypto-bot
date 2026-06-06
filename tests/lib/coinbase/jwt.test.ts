import { generateKeyPairSync } from "node:crypto";

import { beforeEach, describe, expect, it, vi } from "vitest";

// EC P-256 keypair → PEM private key. Generated per test run so we don't ship
// a hardcoded private key in tests (even an obviously-fake one).
const { privateKey: ecPem } = generateKeyPairSync("ec", {
  namedCurve: "P-256",
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

// Ed25519 keypair → raw 32-byte seed, base64 encoded. Simulates the newer CDP
// secret API key format.
const { privateKey: edPrivObj } = generateKeyPairSync("ed25519");
const edPrivJwk = edPrivObj.export({ format: "jwk" }) as { d: string };
// JWK `d` is base64url-encoded; convert to standard base64 to match what
// Coinbase ships (operator's sibling-app spec calls out "raw 64-byte base64").
const edSeedRaw = Buffer.from(edPrivJwk.d, "base64url").toString("base64");

const KEY_NAME = "organizations/test-org/apiKeys/test-key";

vi.mock("@/lib/env", () => ({
  env: vi.fn(() => ({
    COINBASE_API_KEY_NAME: KEY_NAME,
    COINBASE_API_PRIVATE_KEY: ecPem,
  })),
}));

// Re-imported in beforeEach blocks where we swap the mock for the EdDSA path.
import { env } from "@/lib/env";
import { __testing, mintJWT } from "@/lib/coinbase/jwt";

function splitJwt(jwt: string): { header: string; claims: string; signature: string } {
  const parts = jwt.split(".");
  if (parts.length !== 3 || !parts[0] || !parts[1] || !parts[2]) {
    throw new Error(`Malformed JWT (expected 3 parts, got ${parts.length})`);
  }
  return { header: parts[0], claims: parts[1], signature: parts[2] };
}

function decodeJwtPart(b64url: string): unknown {
  // Standard JWT base64url → JSON decode. Helper for inspection only;
  // the actual jwt.ts encoder uses node's `Buffer.toString("base64url")`.
  return JSON.parse(Buffer.from(b64url, "base64url").toString("utf-8"));
}

describe("lib/coinbase/jwt — mintJWT", () => {
  beforeEach(() => {
    // Default to ES256 (PEM) key for the bulk of tests; override per-test
    // where EdDSA-specific behavior matters.
    vi.mocked(env).mockReturnValue({
      COINBASE_API_KEY_NAME: KEY_NAME,
      COINBASE_API_PRIVATE_KEY: ecPem,
    } as ReturnType<typeof env>);
  });

  describe("ES256 path (PEM EC private key)", () => {
    it("returns a 3-part JWT (header.claims.signature)", () => {
      const jwt = mintJWT("GET", "/api/v3/brokerage/accounts");
      expect(jwt.split(".")).toHaveLength(3);
    });

    it("header has alg=ES256, kid=keyName, typ=JWT, and a nonce", () => {
      const jwt = mintJWT("GET", "/api/v3/brokerage/accounts");
      const { header: headerB64 } = splitJwt(jwt);
      const header = decodeJwtPart(headerB64) as Record<string, unknown>;
      expect(header.alg).toBe("ES256");
      expect(header.kid).toBe(KEY_NAME);
      expect(header.typ).toBe("JWT");
      expect(typeof header.nonce).toBe("string");
      expect((header.nonce as string).length).toBeGreaterThan(10);
    });

    it("claims have sub=keyName, iss=cdp, nbf+exp, and uri", () => {
      const jwt = mintJWT("GET", "/api/v3/brokerage/accounts");
      const { claims: claimsB64 } = splitJwt(jwt);
      const claims = decodeJwtPart(claimsB64) as Record<string, unknown>;
      expect(claims.sub).toBe(KEY_NAME);
      expect(claims.iss).toBe("cdp");
      expect(typeof claims.nbf).toBe("number");
      expect(typeof claims.exp).toBe("number");
      expect((claims.exp as number) - (claims.nbf as number)).toBe(120);
      expect(claims.uri).toBe("GET api.coinbase.com/api/v3/brokerage/accounts");
    });

    it("strips querystring from the uri claim", () => {
      const jwt = mintJWT("GET", "/api/v3/brokerage/accounts?limit=250&cursor=abc");
      const { claims: claimsB64 } = splitJwt(jwt);
      const claims = decodeJwtPart(claimsB64) as Record<string, unknown>;
      expect(claims.uri).toBe("GET api.coinbase.com/api/v3/brokerage/accounts");
    });

    it("uppercases the HTTP method in the uri claim", () => {
      const jwt = mintJWT("post", "/api/v3/brokerage/orders");
      const { claims: claimsB64 } = splitJwt(jwt);
      const claims = decodeJwtPart(claimsB64) as Record<string, unknown>;
      expect(claims.uri).toBe("POST api.coinbase.com/api/v3/brokerage/orders");
    });

    it("produces unique nonces across consecutive mints", () => {
      const jwt1 = mintJWT("GET", "/api/v3/brokerage/accounts");
      const jwt2 = mintJWT("GET", "/api/v3/brokerage/accounts");
      const header1 = decodeJwtPart(splitJwt(jwt1).header) as { nonce: string };
      const header2 = decodeJwtPart(splitJwt(jwt2).header) as { nonce: string };
      expect(header1.nonce).not.toBe(header2.nonce);
    });

    it("produces a non-empty signature", () => {
      const jwt = mintJWT("GET", "/api/v3/brokerage/accounts");
      const { signature: sig } = splitJwt(jwt);
      // ES256 signature is 64 bytes raw → ~86 chars base64url.
      expect(sig.length).toBeGreaterThan(80);
    });
  });

  describe("EdDSA path (raw base64 Ed25519 seed)", () => {
    beforeEach(() => {
      vi.mocked(env).mockReturnValue({
        COINBASE_API_KEY_NAME: KEY_NAME,
        COINBASE_API_PRIVATE_KEY: edSeedRaw,
      } as ReturnType<typeof env>);
    });

    it("uses alg=EdDSA in the header", () => {
      const jwt = mintJWT("GET", "/api/v3/brokerage/accounts");
      const { header: headerB64 } = splitJwt(jwt);
      const header = decodeJwtPart(headerB64) as Record<string, unknown>;
      expect(header.alg).toBe("EdDSA");
    });

    it("produces a 3-part JWT (header.claims.signature) for Ed25519", () => {
      const jwt = mintJWT("GET", "/api/v3/brokerage/accounts");
      expect(jwt.split(".")).toHaveLength(3);
    });

    it("produces a non-empty signature for Ed25519", () => {
      const jwt = mintJWT("GET", "/api/v3/brokerage/accounts");
      const { signature: sig } = splitJwt(jwt);
      // Ed25519 signature is exactly 64 bytes → 86 chars base64url.
      expect(sig.length).toBeGreaterThan(80);
    });

    it("claims layout is identical to ES256 path (same spec)", () => {
      const jwt = mintJWT("POST", "/api/v3/brokerage/orders?dry_run=true");
      const { claims: claimsB64 } = splitJwt(jwt);
      const claims = decodeJwtPart(claimsB64) as Record<string, unknown>;
      expect(claims.sub).toBe(KEY_NAME);
      expect(claims.iss).toBe("cdp");
      expect(claims.uri).toBe("POST api.coinbase.com/api/v3/brokerage/orders");
    });
  });

  describe("internal helpers", () => {
    it("detectAlgorithm: PEM EC → ES256", () => {
      expect(__testing.detectAlgorithm(ecPem)).toBe("ES256");
    });

    it("detectAlgorithm: raw base64 → EdDSA", () => {
      expect(__testing.detectAlgorithm(edSeedRaw)).toBe("EdDSA");
    });

    it("detectAlgorithm: leading whitespace before PEM header still detects ES256", () => {
      expect(__testing.detectAlgorithm("  \n" + ecPem)).toBe("ES256");
    });

    it("stripQuerystring: returns input unchanged when no '?' present", () => {
      expect(__testing.stripQuerystring("/api/v3/brokerage/accounts")).toBe("/api/v3/brokerage/accounts");
    });

    it("stripQuerystring: drops everything from '?' onward", () => {
      expect(__testing.stripQuerystring("/api/v3/brokerage/accounts?limit=250&cursor=abc")).toBe(
        "/api/v3/brokerage/accounts",
      );
    });

    it("stripQuerystring: handles bare '?' at end", () => {
      expect(__testing.stripQuerystring("/api/v3/brokerage/accounts?")).toBe("/api/v3/brokerage/accounts");
    });
  });
});
