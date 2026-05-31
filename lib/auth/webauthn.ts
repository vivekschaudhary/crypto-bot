// SimpleWebAuthn server wrappers. Thin layer over @simplewebauthn/server that
// reads RP ID + expected origin from `lib/env` so consumers don't have to
// thread env through every call site.
//
// Per architecture.md § Foundational Identity & Access Posture / Credential
// strategy: SimpleWebAuthn (server + browser) is the production-stable
// underlying lib; we use it directly rather than Auth.js Passkey (which is
// still experimental as of early 2026 per arch-research.md §1.4).
//
// All four functions take an options-object shape (TS-idiomatic), with the
// RP ID and expectedOrigin sourced internally from `lib/env`. Consumers
// supply only the call-site-specific args.

import {
  generateAuthenticationOptions as gao,
  generateRegistrationOptions as gro,
  verifyAuthenticationResponse as varesp,
  verifyRegistrationResponse as vrresp,
  type GenerateRegistrationOptionsOpts,
  type VerifiedAuthenticationResponse,
  type VerifiedRegistrationResponse,
  type VerifyAuthenticationResponseOpts,
  type VerifyRegistrationResponseOpts,
} from "@simplewebauthn/server";
import { origin } from "@/lib/env";

const RP_NAME = "Crypto DCA Bot";

function rpIDFromEnv(): string {
  // RP ID is the hostname (no protocol, no port). Strip both from APP_ORIGIN.
  const url = new URL(origin());
  return url.hostname;
}

function expectedOriginFromEnv(): string {
  // Expected origin matches what the browser will report — protocol + host
  // (+ port if non-default). Use the full origin verbatim.
  return origin();
}

// Re-derive the type names we use locally from the opts shapes that ARE
// exported from @simplewebauthn/server's index (the verbose
// AuthenticationResponseJSON / WebAuthnCredential / etc. types live in
// @simplewebauthn/types and aren't re-exported from index).
export type RegistrationResponseJSON = VerifyRegistrationResponseOpts["response"];
export type AuthenticationResponseJSON = VerifyAuthenticationResponseOpts["response"];
export type WebAuthnCredential = VerifyAuthenticationResponseOpts["credential"];
export type PublicKeyCredentialCreationOptionsJSON = Awaited<ReturnType<typeof gro>>;
export type PublicKeyCredentialRequestOptionsJSON = Awaited<ReturnType<typeof gao>>;
export type CredentialDescriptor = NonNullable<GenerateRegistrationOptionsOpts["excludeCredentials"]>[number];

/**
 * Generate options to pass to `navigator.credentials.create()` for passkey
 * registration. `userId` is stored as the WebAuthn user.id (encoded as bytes).
 */
export async function generateRegistrationOptions(args: {
  userId: string;
  userName: string;
  excludeCredentials?: CredentialDescriptor[];
}): Promise<PublicKeyCredentialCreationOptionsJSON> {
  return gro({
    rpName: RP_NAME,
    rpID: rpIDFromEnv(),
    userName: args.userName,
    userID: new TextEncoder().encode(args.userId),
    excludeCredentials: args.excludeCredentials,
    authenticatorSelection: { residentKey: "preferred", userVerification: "preferred" },
  });
}

/**
 * Verify the browser's `navigator.credentials.create()` response.
 * `expectedChallenge` is the challenge minted via `lib/auth/challenges`
 * and consumed at the start of the finish handler.
 */
export async function verifyRegistrationResponse(args: {
  response: RegistrationResponseJSON;
  expectedChallenge: string;
}): Promise<VerifiedRegistrationResponse> {
  return vrresp({
    response: args.response,
    expectedChallenge: args.expectedChallenge,
    expectedOrigin: expectedOriginFromEnv(),
    expectedRPID: rpIDFromEnv(),
  });
}

/**
 * Generate options to pass to `navigator.credentials.get()` for passkey
 * authentication.
 */
export async function generateAuthenticationOptions(
  args: { allowCredentials?: CredentialDescriptor[] } = {},
): Promise<PublicKeyCredentialRequestOptionsJSON> {
  return gao({
    rpID: rpIDFromEnv(),
    allowCredentials: args.allowCredentials,
  });
}

/**
 * Verify the browser's `navigator.credentials.get()` response.
 * `credential` is the stored credential record (id, publicKey, counter,
 * transports) loaded from `auth_credentials` by the route handler.
 */
export async function verifyAuthenticationResponse(args: {
  response: AuthenticationResponseJSON;
  expectedChallenge: string;
  credential: WebAuthnCredential;
}): Promise<VerifiedAuthenticationResponse> {
  return varesp({
    response: args.response,
    expectedChallenge: args.expectedChallenge,
    expectedOrigin: expectedOriginFromEnv(),
    expectedRPID: rpIDFromEnv(),
    credential: args.credential,
  });
}
