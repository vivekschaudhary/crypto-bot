// CB-8.0 — dashboard shell: a responsive [sidebar | content] layout (replaces
// the CB-6.0 top 3-tab strip). The responsive CSS lives in app/globals.css
// (`.dashboard-shell` / `.dashboard-sidebar` / `.dashboard-content`). Server
// Component; fetches the operator's device label (same x-session-user-id → DB
// read as the cockpit, CB-1.4 Decision #5 — convenience header, not an auth
// claim) and passes it to the sidebar footer. Read-only (SELECT); the dashboard
// read-only invariant holds.

import { headers } from "next/headers";
import type { JSX } from "react";

import { db } from "@/lib/db/client";

import { DashboardSidebar } from "./dashboard-sidebar";

type CredRow = { device_label: string | null };

export default async function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<JSX.Element> {
  const h = await headers();
  const userId = h.get("x-session-user-id");

  let deviceLabel: string | null = null;
  if (userId) {
    try {
      const sql = db();
      const rows = await sql<CredRow[]>`
        SELECT device_label FROM auth_credentials WHERE user_id = ${userId} LIMIT 1
      `;
      deviceLabel = rows[0]?.device_label ?? null;
    } catch {
      deviceLabel = null;
    }
  }
  const connectedDevice = deviceLabel && deviceLabel.length > 0 ? deviceLabel : "this device";

  return (
    <div className="dashboard-shell">
      <DashboardSidebar connectedDevice={connectedDevice} />
      <main className="dashboard-content">{children}</main>
    </div>
  );
}
