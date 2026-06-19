# CB-8.0 — Copy (verbatim)

_UX Writer artifact. VERBATIM (refusal rule #5). The sidebar chrome for the responsive shell. Nav labels keep the existing CB-6.0 emoji for the three asset views (continuity) + plain labels for the three existing routes promoted into the nav._

## Sidebar
- App title (header): `crypto-bot`
- Nav items (in order):
  - `🤖 Crypto`  → `/dashboard`
  - `📈 Equity`  → `/dashboard/equity`
  - `📊 Mutual Funds`  → `/dashboard/mutual-funds`
  - `Strategy`  → `/dashboard/strategy`
  - `Decision trace`  → `/dashboard/trace`
  - `Ledger`  → `/dashboard/ledger`
- Footer:
  - Device line: `Connected device: <device label>` (reuse the existing cockpit wording; `<device label>` is the stored `device_label`, or `this device` when absent — matches `app/dashboard/page.tsx`).
  - Sign-out button: `Sign out` (the existing `SignOutClient`, unchanged).

## Notes for the build
- `aria-label` for the nav: `Primary`.
- The three asset labels (`🤖 Crypto` / `📈 Equity` / `📊 Mutual Funds`) are unchanged from CB-6.0's top tabs (moved into the sidebar). `Strategy` / `Decision trace` / `Ledger` were previously reachable only via in-page links; now first-class nav items.
- No new identity copy — the footer reuses the existing device-label wording; email is NOT shown (not stored).
