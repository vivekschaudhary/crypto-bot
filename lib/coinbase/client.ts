// Coinbase Advanced Trade client — typed REST wrapper.
//
// CDP only — Coinbase Pro / HMAC legacy auth is NOT supported here.
//
// Two request paths:
//   - `request(method, path, body?)`     — authenticated; mints a per-request
//                                          JWT via `lib/coinbase/jwt` and
//                                          attaches as `Authorization: Bearer`.
//                                          Use for `/api/v3/brokerage/accounts`,
//                                          `/api/v3/brokerage/orders`, etc.
//   - `publicRequest(method, path)`      — unauthenticated; plain fetch with
//                                          no JWT. Use ONLY for
//                                          `/api/v3/brokerage/market/*` paths
//                                          (Coinbase's documented public
//                                          endpoints).
//
// Both throw `CoinbaseClientError` on non-2xx responses; both return the parsed
// JSON body on success. Zod validation is per-endpoint and lives in the
// downstream wrapper modules (market.ts, accounts.ts, orders.ts) shipped in
// CB-2.2/.3/.4. This file stays Zod-free; the client returns `unknown` and
// callers narrow.
//
// Per CB-2 brief PM DRI Decision #3: this file does NOT reference LIVE_MODE.
// The wrapper is policy-free; CB-4 owns the gate.

import { mintJWT } from "@/lib/coinbase/jwt";
import { CoinbaseClientError } from "@/lib/coinbase/types";

const COINBASE_BASE_URL = "https://api.coinbase.com";

export type HttpMethod = "GET" | "POST" | "PUT" | "DELETE";

export interface CoinbaseClient {
  /**
   * Authenticated request. Mints a per-request JWT, attaches it as
   * `Authorization: Bearer <jwt>`. Returns parsed JSON on 2xx; throws
   * `CoinbaseClientError` otherwise.
   */
  request<T = unknown>(method: HttpMethod, path: string, body?: unknown): Promise<T>;
  /**
   * Unauthenticated request to a Coinbase public endpoint
   * (`/api/v3/brokerage/market/*`). No JWT attached.
   */
  publicRequest<T = unknown>(method: HttpMethod, path: string): Promise<T>;
}

let cached: CoinbaseClient | undefined;

/**
 * Lazy-cached Coinbase client. First call constructs; subsequent calls return
 * the same reference. Mirrors `lib/env`'s lazy-cache pattern so the JWT
 * signing setup (`env()` reads, key-format detection) runs at most once per
 * process — though re-runs on every request are also fine; this is a
 * micro-optimization, not a correctness requirement.
 */
export function coinbase(): CoinbaseClient {
  if (cached) return cached;
  cached = makeClient();
  return cached;
}

function makeClient(): CoinbaseClient {
  return {
    async request<T = unknown>(method: HttpMethod, path: string, body?: unknown): Promise<T> {
      const jwt = mintJWT(method, path);
      const res = await safeFetch(method, path, `${COINBASE_BASE_URL}${path}`, {
        method,
        headers: {
          authorization: `Bearer ${jwt}`,
          "content-type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      return handleResponse<T>(method, path, res);
    },

    async publicRequest<T = unknown>(method: HttpMethod, path: string): Promise<T> {
      const res = await safeFetch(method, path, `${COINBASE_BASE_URL}${path}`, {
        method,
        headers: { "content-type": "application/json" },
      });
      return handleResponse<T>(method, path, res);
    },
  };
}

/**
 * Wrap `fetch()` so transport-layer failures (DNS, TLS handshake, connection
 * reset, timeout, AbortError, etc.) surface as `CoinbaseClientError` with
 * `code: "network"`. Without this wrap, consumers would have to handle two
 * error shapes — `CoinbaseClientError` for non-2xx responses AND raw
 * `TypeError` / `DOMException` for transport failures. The wrapper's job is
 * to give consumers one uniform error contract.
 *
 * Per Codex PR #26 round-1 BLOCKER: the original CB-2.1 implementation
 * only wrapped non-2xx Responses, letting transport failures escape as
 * raw fetch errors.
 */
async function safeFetch(method: HttpMethod, path: string, url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (err) {
    const reason = err instanceof Error ? err.message : String(err);
    throw new CoinbaseClientError({
      code: "network",
      message: `Coinbase ${method} ${path} failed at the transport layer: ${reason}`,
      cause: err,
    });
  }
}

async function handleResponse<T>(method: HttpMethod, path: string, res: Response): Promise<T> {
  // Parse body as JSON; tolerate a non-JSON body (rare from Coinbase but
  // possible from edge layers like Cloudflare 5xx pages).
  let parsedBody: unknown;
  const text = await res.text();
  if (text.length === 0) {
    parsedBody = undefined;
  } else {
    try {
      parsedBody = JSON.parse(text);
    } catch {
      parsedBody = text;
    }
  }

  if (!res.ok) {
    throw CoinbaseClientError.fromHttpResponse({
      method,
      path,
      status: res.status,
      body: parsedBody,
    });
  }

  return parsedBody as T;
}

// Exported for direct unit-test access — lets tests reset the cached singleton
// between cases without restarting the Vitest worker.
export const __testing = {
  resetCache(): void {
    cached = undefined;
  },
};
