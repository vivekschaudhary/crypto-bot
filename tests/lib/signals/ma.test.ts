// Unit tests for `lib/signals/ma.ts` — Simple Moving Average.
//
// CB-4.0 AC 9 — golden-value tests covering arithmetic correctness +
// last-N-bars-only window (PM Risk #2: off-by-one in last-N extraction) +
// insufficient-bars + NaN + degenerate period=1.

import { describe, expect, it } from "vitest";

import { ma } from "@/lib/signals/ma";

describe("ma — trivial arithmetic-mean cases", () => {
  it("MA(5) of [1, 2, 3, 4, 5] returns 3.0", () => {
    expect(ma(5, [1, 2, 3, 4, 5])).toBe(3.0);
  });

  it("MA(2) of [10, 20] returns 15.0", () => {
    expect(ma(2, [10, 20])).toBe(15.0);
  });

  it("MA(3) of constant series returns the constant", () => {
    expect(ma(3, [100, 100, 100])).toBe(100);
  });
});

describe("ma — last-N-only window (PM Risk #2 mitigation: off-by-one in last-N extraction)", () => {
  it("MA(3) of [1, 2, 3, 4, 5, 6, 7] uses only the LAST 3 bars: (5+6+7)/3 = 6.0", () => {
    // This is the load-bearing test. The off-by-one bug pattern would
    // compute either mean of all 7 (= 4.0) or mean of the first 3 (= 2.0)
    // or mean of the wrong 3 bars. Pinning the exact expected output is
    // the structural defense the PM Risk #2 mitigation calls for.
    expect(ma(3, [1, 2, 3, 4, 5, 6, 7])).toBe(6.0);
  });

  it("MA(20) of 50-bar series uses only the last 20 (verified by changing only those)", () => {
    // Build a series where the last 20 sum to a known value (e.g., 200)
    // independent of the first 30. If the function used the wrong window,
    // result wouldn't equal 200/20 = 10.0.
    const first30 = Array(30).fill(999); // garbage; should be excluded
    const last20 = Array(20).fill(10); // mean = 10
    expect(ma(20, [...first30, ...last20])).toBe(10);
  });
});

describe("ma — degenerate period=1 case", () => {
  it("MA(1) returns the last close verbatim", () => {
    expect(ma(1, [42])).toBe(42);
    expect(ma(1, [1, 2, 3, 99])).toBe(99);
  });
});

describe("ma — sentinel returns (insufficient bars / NaN / invalid period)", () => {
  it("returns null when series length is less than period", () => {
    expect(ma(5, [1, 2, 3])).toBeNull();
  });

  it("returns null when series is empty", () => {
    expect(ma(5, [])).toBeNull();
  });

  it("returns null when input contains NaN (defense-in-depth)", () => {
    expect(ma(3, [1, 2, NaN])).toBeNull();
  });

  it("returns null when last-N window contains NaN even if earlier bars are clean", () => {
    expect(ma(3, [1, 2, 3, 4, NaN, 6])).toBeNull();
  });

  it("returns null when NaN appears in earlier bars OUTSIDE the trailing window (PR #58 round-1 BLOCKER regression)", () => {
    // Codex BLOCKER closure: AC 6 contract says "NaN in input array →
    // null", FULL stop. The earlier prototype scanned only the trailing
    // window (window-only optimization), letting `ma(3, [NaN, 1, 2, 3])
    // === 2` slip through arithmetically-valid but contract-violating.
    // This test pins the contract: any NaN anywhere in the input → null.
    expect(ma(3, [NaN, 1, 2, 3])).toBeNull();
    // And a longer series where NaN is far outside the window:
    expect(ma(3, [NaN, 100, 200, 1, 2, 3])).toBeNull();
  });

  it("returns null when Infinity appears in earlier bars OUTSIDE the trailing window", () => {
    expect(ma(3, [Infinity, 1, 2, 3])).toBeNull();
    expect(ma(3, [-Infinity, 1, 2, 3])).toBeNull();
  });

  it("returns null when input contains Infinity (defense-in-depth)", () => {
    expect(ma(3, [1, 2, Infinity])).toBeNull();
  });

  it("returns null when period is 0", () => {
    expect(ma(0, [1, 2, 3])).toBeNull();
  });

  it("returns null when period is negative", () => {
    expect(ma(-1, [1, 2, 3])).toBeNull();
  });

  it("returns null when period is non-integer", () => {
    expect(ma(3.5, [1, 2, 3, 4])).toBeNull();
  });
});

describe("ma — strategy-relevant periods (CB-3.0 MaPeriodSchema {5, 10, 20, 50})", () => {
  it("MA(5) on a real-shaped price series", () => {
    const closes = [100, 102, 101, 103, 104];
    expect(ma(5, closes)).toBeCloseTo(102, 5);
  });

  it("MA(50) on a 60-bar series uses only the last 50", () => {
    const first10 = Array(10).fill(50); // excluded
    const last50 = Array(50).fill(100); // mean = 100
    expect(ma(50, [...first10, ...last50])).toBe(100);
  });
});
