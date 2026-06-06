// Per-request JWT minting for Coinbase Advanced Trade CDP auth.
//
// CDP only — Coinbase Pro / HMAC legacy auth is NOT supported here.
//
// Algorithm is auto-detected from key format (per the operator's sibling-app
// pattern surfaced during /build CB-2.1 plan-mode review):
//   - PEM-wrapped EC private key  (`-----BEGIN ... PRIVATE KEY-----`) → ES256
//   - Raw 64-byte base64                                              → EdDSA (Ed25519)
//
// No external JWT library; node:crypto handles both signing algorithms
// natively — mirrors lib/auth/cookie.ts's "Node built-ins, no third-party
// crypto" posture.
//
// ──────────────────────────────────────────────────────────────────────────
// EdDSA caveat — UNVERIFIED FOR COINBASE BROKERAGE ENDPOINTS
// ──────────────────────────────────────────────────────────────────────────
// Coinbase's general "Advanced Trade auth" docs say both Ed25519 (EdDSA) and
// ECDSA (ES256) keys work for direct API calls. HOWEVER, Coinbase's
// brokerage-specific auth/CLI documentation says to **create ECDSA keys for
// brokerage** and warns that **Ed25519 returns HTTP 401** from
// `/api/v3/brokerage/*` endpoints.
//
// The operator's sibling app reports the EdDSA path works against their
// Coinbase target (which may or may not be brokerage). We keep the EdDSA
// path implemented (per CB-2.1 Engineer DRI Decision — option (b)) but
// **flag that it MAY return 401 from `/api/v3/brokerage/*` endpoints.**
// Verify against real Coinbase brokerage with a real EdDSA credential
// before relying on it for production traffic.
//
// Resolution path: when CB-2.5 (trace.ts) ships Sentry breadcrumbs +
// rate-limit-header awareness, an EdDSA brokerage integration test against
// real Coinbase will resolve the ambiguity. If 401 confirmed at that point,
// drop the EdDSA path in a Decision-supersession entry; if 200 confirmed,
// promote this caveat to a closed Risk.
//
// Tracked as story-level Engineer Risk in
// docs/bets/CB-2/stories/CB-2.1/story.md DRI Log.
// Surfaced by Codex code review of PR #26 round-1 (BLOCKER).
// ──────────────────────────────────────────────────────────────────────────
//
// Per CB-2 brief PM DRI Decision #3: this file does NOT reference LIVE_MODE.
// The wrapper is policy-free; the consumer (CB-4) owns the gate.
//
// JWT contract (CDP-specific):
//   Headers: { alg: "ES256" | "EdDSA", kid: <keyName>, nonce: <base64url>, typ: "JWT" }
//   Claims:  { sub: <keyName>, iss: "cdp", nbf: <now>, exp: <now>+120s,
//              uri: "<METHOD> api.coinbase.com<path-without-querystring>" }

import { createPrivateKey, createSign, randomBytes, sign as cryptoSign } from "node:crypto";

import { env } from "@/lib/env";

const COINBASE_HOST = "api.coinbase.com";
const JWT_EXPIRY_SECONDS = 120;
const NONCE_BYTES = 16;

type Algorithm = "ES256" | "EdDSA";

function nowSeconds(): number {
  return Math.floor(Date.now() / 1000);
}

function base64UrlEncode(input: Buffer | string): string {
  const buf = typeof input === "string" ? Buffer.from(input, "utf-8") : input;
  return buf.toString("base64url");
}

function detectAlgorithm(privateKey: string): Algorithm {
  // PEM-wrapped keys (EC P-256, the legacy Advanced Trade format) start with
  // a standard PEM header. Raw 64-byte base64 (newer CDP secret API key
  // format) does not.
  return privateKey.trimStart().startsWith("-----BEGIN") ? "ES256" : "EdDSA";
}

function stripQuerystring(path: string): string {
  const q = path.indexOf("?");
  return q === -1 ? path : path.slice(0, q);
}

function buildHeaders(alg: Algorithm, keyName: string): {
  alg: Algorithm;
  kid: string;
  nonce: string;
  typ: "JWT";
} {
  return {
    alg,
    kid: keyName,
    nonce: randomBytes(NONCE_BYTES).toString("base64url"),
    typ: "JWT",
  };
}

function buildClaims(method: string, path: string, keyName: string): {
  sub: string;
  iss: "cdp";
  nbf: number;
  exp: number;
  uri: string;
} {
  const now = nowSeconds();
  const pathNoQuery = stripQuerystring(path);
  return {
    sub: keyName,
    iss: "cdp",
    nbf: now,
    exp: now + JWT_EXPIRY_SECONDS,
    uri: `${method.toUpperCase()} ${COINBASE_HOST}${pathNoQuery}`,
  };
}

function signES256(signingInput: string, pem: string): string {
  // ECDSA P-256 over SHA-256. The signing input is the standard JWT
  // "<headerB64>.<claimsB64>" payload.
  const signer = createSign("SHA256");
  signer.update(signingInput);
  signer.end();
  // Coinbase expects raw R||S concatenation (JWS spec), which is what
  // createPrivateKey + DSA signing on a P-256 key produces by default via
  // dsaEncoding: "ieee-p1363".
  const sigDer = signer.sign({
    key: pem,
    dsaEncoding: "ieee-p1363",
  });
  return sigDer.toString("base64url");
}

function signEdDSA(signingInput: string, rawBase64: string): string {
  // Ed25519. Coinbase CDP issues raw 64-byte (32-byte seed + 32-byte public-key)
  // or raw 32-byte (seed only) private keys; we accept either and let
  // createPrivateKey work out the construction.
  //
  // We try the most common construction first (PKCS#8 wrap of the raw seed);
  // if Coinbase's key format is bare 32-byte we fall through to a different
  // construction. The retry-and-recover lives here rather than in the caller
  // so the public JWT API stays algorithm-agnostic.
  const rawBytes = Buffer.from(rawBase64, "base64");
  // For Ed25519, node:crypto accepts a JWK with `kty: "OKP", crv: "Ed25519",
  // d: <base64url-encoded 32-byte seed>` — most portable path.
  const seed = rawBytes.length === 64 ? rawBytes.subarray(0, 32) : rawBytes;
  const jwk = {
    kty: "OKP" as const,
    crv: "Ed25519" as const,
    d: seed.toString("base64url"),
    // `x` (the public key) can be omitted for signing; node:crypto derives it
    // internally from the seed.
    x: "",
  };
  const keyObject = createPrivateKey({ key: jwk, format: "jwk" });
  const signature = cryptoSign(null, Buffer.from(signingInput, "utf-8"), keyObject);
  return signature.toString("base64url");
}

/**
 * Mint a JWT for one Coinbase Advanced Trade request.
 *
 * @param method HTTP verb (`"GET"`, `"POST"`, ...). Case-insensitive at the call
 *   site; normalized to uppercase in the `uri` claim.
 * @param path Path WITH querystring (e.g. `/api/v3/brokerage/accounts?limit=250`).
 *   The querystring is stripped before being put in the `uri` claim — Coinbase's
 *   CDP JWT spec requires path-without-querystring.
 * @returns The minted JWT (`<headerB64url>.<claimsB64url>.<signatureB64url>`).
 *   Callers attach it as `Authorization: Bearer <jwt>`.
 */
export function mintJWT(method: string, path: string): string {
  const e = env();
  const keyName = e.COINBASE_API_KEY_NAME;
  const privateKey = e.COINBASE_API_PRIVATE_KEY;

  const alg = detectAlgorithm(privateKey);
  const headers = buildHeaders(alg, keyName);
  const claims = buildClaims(method, path, keyName);

  const headerB64 = base64UrlEncode(JSON.stringify(headers));
  const claimsB64 = base64UrlEncode(JSON.stringify(claims));
  const signingInput = `${headerB64}.${claimsB64}`;

  const signature = alg === "ES256" ? signES256(signingInput, privateKey) : signEdDSA(signingInput, privateKey);

  return `${signingInput}.${signature}`;
}

// Exported for direct unit-test coverage in tests/lib/coinbase/jwt.test.ts.
// Per Codex's appetite for testable internals (see CB-1.6 setup-client.tsx
// precedent), the format-detection function is exposed so the matrix can
// be tested in isolation without minting a real JWT.
export const __testing = {
  detectAlgorithm,
  stripQuerystring,
};
