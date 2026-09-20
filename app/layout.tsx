import type { Metadata } from "next";
import { Plus_Jakarta_Sans, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

// Example Co Design System typefaces (shared with our other internal apps).
const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

const splineMono = Spline_Sans_Mono({
  variable: "--font-spline-mono",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://drmc-demo.vercel.app"),
  title: "DRMC",
  description: "DRMC — the employee directory and org structure of record.",
  // Link previews: /og.png is a static file, so the auth proxy never sees it.
  openGraph: {
    type: "website",
    url: "/",
    siteName: "DRMC demo",
    title: "DRMC: daily-report approvals and compliance (live demo)",
    description:
      "Approvals queue with a durable bulk approve that survives an outage, a filing-compliance dashboard and hours analysis. Invented data; resets nightly.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "Approvals queue in the DRMC demo" }],
  },
  twitter: { card: "summary_large_image", images: ["/og.png"] },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${jakarta.variable} ${splineMono.variable} h-full antialiased`}>
      <body className="min-h-full bg-paper text-ink">{children}</body>
    </html>
  );
}
