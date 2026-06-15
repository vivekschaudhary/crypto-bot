// Regression test for the /dashboard/strategy production 500 (2026-06-15):
// "Error: Functions cannot be passed directly to Client Components."
//
// The page passed `labels.assetSelectorHeader` — a `(date) => string`
// FUNCTION — as a prop to the StrategyFormClient ("use client") component.
// Next.js cannot serialize a function across the RSC server→client boundary,
// so EVERY production render of this route 500'd. It went undetected because
// the e2e suite runs `pnpm dev` (playwright.config webServer), and Next dev
// is lenient about function props where the production RSC serializer is not
// — a dev-masks-prod gap.
//
// A Server Component returns an element TREE; awaiting it does NOT invoke the
// child Client Component, so we walk the returned tree to the
// StrategyFormClient element and inspect the PROPS it would be handed across
// the RSC boundary, asserting none is a function. (JSON.stringify can't catch
// this — it silently drops functions.)

import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next/headers", () => ({
  headers: async () => new Map([["x-session-user-id", "u-1"]]),
}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));

const getActiveStrategy = vi.fn();
vi.mock("@/lib/strategies/db", () => ({ getActiveStrategy: () => getActiveStrategy() }));

vi.mock("@/lib/strategy-coinbase/adapter", () => ({ makeCoinbaseAdapter: () => ({}) }));

const topN = vi.fn();
vi.mock("@/lib/strategy-core/top-n", () => ({ topN: (...a: unknown[]) => topN(...a) }));

// Sentinel mock so we can locate the element by type identity in the tree.
const hoisted = vi.hoisted(() => ({ StrategyFormClient: () => null }));
vi.mock("@/app/dashboard/strategy/strategy-form-client", () => ({
  StrategyFormClient: hoisted.StrategyFormClient,
}));

import StrategyPage from "@/app/dashboard/strategy/page";

interface Elementish {
  type?: unknown;
  props?: { children?: unknown } & Record<string, unknown>;
}

/** Depth-first search of a React element tree for the element of a given type. */
function findElementByType(node: unknown, type: unknown): Elementish | null {
  if (Array.isArray(node)) {
    for (const child of node) {
      const found = findElementByType(child, type);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  const el = node as Elementish;
  if (el.type === type) return el;
  return findElementByType(el.props?.children, type);
}

/** Dotted path of the first function value found in props, else null. */
function findFunctionProp(value: unknown, path = ""): string | null {
  if (typeof value === "function") return path || "(root)";
  if (value && typeof value === "object" && !(value instanceof Date)) {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const found = findFunctionProp(v, path ? `${path}.${k}` : k);
      if (found) return found;
    }
  }
  return null;
}

beforeEach(() => {
  vi.clearAllMocks();
  getActiveStrategy.mockResolvedValue(null); // first-time empty state
  topN.mockResolvedValue([{ assetClass: "crypto-coinbase", identifier: "BTC-USD" }]);
});

describe("StrategyPage — RSC serializability (regression: prod 500 on function prop)", () => {
  it("passes NO function prop to the StrategyFormClient client component", async () => {
    const tree = await StrategyPage();
    const el = findElementByType(tree, hoisted.StrategyFormClient);
    expect(el, "StrategyFormClient element not found in the page tree").not.toBeNull();
    const fnPath = findFunctionProp(el?.props);
    expect(
      fnPath,
      `prop "${fnPath}" is a function — it cannot cross the RSC boundary and 500s in production`,
    ).toBeNull();
  });

  it("assetSelectorHeader is a precomputed string, not a function", async () => {
    const tree = await StrategyPage();
    const el = findElementByType(tree, hoisted.StrategyFormClient);
    const labels = el?.props?.labels as { assetSelectorHeader?: unknown } | undefined;
    expect(typeof labels?.assetSelectorHeader).toBe("string");
  });
});
