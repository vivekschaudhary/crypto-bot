// Postgres client (postgres.js). Single connection per process; postgres.js
// handles its own pool. Connection string points at Supabase pooler endpoint
// per architecture.md Foundational Data Model § Migration strategy.

import postgres from "postgres";
import { env } from "@/lib/env";

let client: ReturnType<typeof postgres> | undefined;

export function db() {
  if (client) return client;
  client = postgres(env().DATABASE_URL, {
    // Supabase pooler-friendly defaults
    prepare: false, // disable prepared statements (pooler in transaction mode doesn't support them)
    idle_timeout: 20,
    max: 10,
  });
  return client;
}
