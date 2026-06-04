// Per CB-1.6 AC 6 — regression guard. The `app/(dashboard)/` route group
// was a scaffold artifact that nominally resolved to `/` and collided with
// `app/page.tsx`. CB-1.6 deletes it. This test exists so re-introducing
// the directory (intentionally or by template-copy) breaks the build.

import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("scaffold cleanup — `app/(dashboard)/` directory must not exist", () => {
  it("`app/(dashboard)/` directory is absent (CB-1.6 AC 6)", () => {
    const repoRoot = resolve(__dirname, "..");
    const dashboardRouteGroup = resolve(repoRoot, "app/(dashboard)");
    expect(existsSync(dashboardRouteGroup)).toBe(false);
  });

  it("`app/(dashboard)/page.tsx` file is absent (CB-1.6 AC 6)", () => {
    const repoRoot = resolve(__dirname, "..");
    const dashboardRouteGroupPage = resolve(repoRoot, "app/(dashboard)/page.tsx");
    expect(existsSync(dashboardRouteGroupPage)).toBe(false);
  });

  it("real `app/dashboard/page.tsx` route DOES exist (sanity — different path)", () => {
    const repoRoot = resolve(__dirname, "..");
    const realDashboard = resolve(repoRoot, "app/dashboard/page.tsx");
    expect(existsSync(realDashboard)).toBe(true);
  });
});
