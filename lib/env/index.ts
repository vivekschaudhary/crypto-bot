// Typed env-var loader. Validates at startup; fails fast if anything required
// is missing. Cross-cutting standard per architecture.md.
//
// Import this module anywhere you need env access. Do NOT read process.env
// directly outside this file — that bypasses validation.

import { z } from "zod";

const EnvSchema = z.object({
  // Coinbase Advanced Trade — CDP JWT auth (key name + EC private key)
  COINBASE_API_KEY_NAME: z.string().min(1),
  // EC P-256 PEM. Vercel env may store with literal \n escapes; normalize.
  COINBASE_API_PRIVATE_KEY: z
    .string()
    .min(1)
    .transform((s) => s.replace(/\\n/g, "\n")),

  // Live mode toggle — load-bearing safety primitive
  LIVE_MODE: z
    .enum(["true", "false"])
    .default("false")
    .transform((v) => v === "true"),

  // Auth + sessions
  SESSION_SIGNING_SECRET: z.string().min(32, "SESSION_SIGNING_SECRET must be >= 32 chars"),
  RECOVERY_CODE_PEPPER: z.string().min(32, "RECOVERY_CODE_PEPPER must be >= 32 chars"),

  // Cron auth
  CRON_SECRET: z.string().min(1),

  // Database
  DATABASE_URL: z.string().url(),

  // Origin (for WebAuthn relying-party + CSRF)
  APP_ORIGIN: z.string().url().optional(),

  // Node environment
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),

  // Vercel-injected (optional locally)
  VERCEL_URL: z.string().optional(),
  VERCEL_ENV: z.enum(["development", "preview", "production"]).optional(),
});

export type Env = z.infer<typeof EnvSchema>;

let cached: Env | undefined;

export function env(): Env {
  if (cached) return cached;
  const parsed = EnvSchema.safeParse(process.env);
  if (!parsed.success) {
    const formatted = parsed.error.flatten().fieldErrors;
    const message = Object.entries(formatted)
      .map(([k, v]) => `  ${k}: ${v?.join(", ") ?? "invalid"}`)
      .join("\n");
    throw new Error(`Invalid environment variables:\n${message}\n\nSee .env.example for the contract.`);
  }
  cached = parsed.data;
  return cached;
}

/** Origin used for WebAuthn relying-party + CSRF origin checks. */
export function origin(): string {
  const e = env();
  if (e.APP_ORIGIN) return e.APP_ORIGIN;
  if (e.VERCEL_URL) return `https://${e.VERCEL_URL}`;
  return "http://localhost:3000";
}
