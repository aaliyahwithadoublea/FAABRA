import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "FAABRA GLOBAL TRADE",
    template: "%s · FAABRA",
  },
  description:
    "Business management and accounting for FAABRA GLOBAL TRADE — purchases, sales, stock, debtors, creditors, cash, bank, expenses and profit.",
  applicationName: "FAABRA",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "FAABRA",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: [
      { url: "/logo.png", sizes: "512x512", type: "image/png" },
      { url: "/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#1f664a",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="min-h-full font-sans text-ink antialiased">{children}</body>
    </html>
  );
}
