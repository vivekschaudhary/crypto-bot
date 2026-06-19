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

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
