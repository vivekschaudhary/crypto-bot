// `lib/strategy-core/top-n.ts` — generic top-N-by-volume ranking.
//
// CB-3.0 (FIRST CB-3 STORY). Asset-class-agnostic. Calls
// `adapter.getCandidateAssets()` then `adapter.rankByVolume()`, slices to
// top-N. The adapter is the seam where asset-class-specific data fetching
// happens; strategy-core just glues + slices.

import type { AssetAdapter } from "./adapter";
import type { Asset } from "./types";

/**
 * Returns the top-N assets ranked by 24h volume (or asset-class-appropriate
 * "currently liquid" signal) for the given adapter.
 *
 * Useful for the strategy authoring form (CB-3.3) which surfaces the
 * top-N as the candidate set the operator picks 1-5 from.
 *
 * @param adapter The asset-class adapter (crypto-coinbase; equity-mock; etc.).
 * @param n       How many to return. If `n` exceeds the candidate set size,
 *                returns the full sorted set (NOT padded).
 * @returns Top-N assets sorted by volume descending.
 *
 * @throws If `n <= 0` (programming error). The adapter calls themselves may
 *         throw for network / auth / etc. failures; strategy-core does not
 *         wrap or transform those — let them bubble.
 */
export async function topN(
  adapter: AssetAdapter,
  n: number,
): Promise<Asset[]> {
  if (n <= 0 || !Number.isInteger(n)) {
    throw new Error(
      `[strategy-core/top-n] n must be a positive integer, got ${n}`,
    );
  }
  const candidates = await adapter.getCandidateAssets();
  const ranked = await adapter.rankByVolume(candidates);
  return ranked.slice(0, n);
}
