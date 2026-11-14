import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "BenefitsShield — HDHP + HSA vs PPO, 2027",
  description:
    "See which employer health plan really costs you less in 2027, after premiums, employer HSA money and tax savings. No login.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">{children}</body>
    </html>
  );
}
