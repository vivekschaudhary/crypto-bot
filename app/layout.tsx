import "./globals.css";

import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "Crypto DCA Bot",
  description: "Signal-driven DCA bot for Coinbase — operator-only.",
};

// CB-8.0 — mobile responsiveness (absent before; pages rendered at desktop width).
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

// CB-8.1 — apply the persisted sidebar-collapse state BEFORE paint (the dark-mode
// no-flash pattern): set the <html> data attr that app/globals.css reads, so a
// collapsed sidebar never flashes expanded on reload and there's no hydration
// mismatch (the visual is CSS/attr-driven, not React state).
const NO_FLASH_SIDEBAR = `try{if(localStorage.getItem('sidebar-collapsed')==='1')document.documentElement.setAttribute('data-sidebar-collapsed','')}catch(e){}`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        {/* Tiny first-paint state script (no user input) — sets the collapse attr before paint. */}
        <script dangerouslySetInnerHTML={{ __html: NO_FLASH_SIDEBAR }} />
        {children}
      </body>
    </html>
  );
}
