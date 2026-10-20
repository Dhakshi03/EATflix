import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegister } from "@/components/ServiceWorkerRegister";
import { SyncProvider } from "@/components/sync/SyncProvider";

export const metadata: Metadata = {
  title: "EATflix — Personal Nutrition & Protein Tracker",
  description:
    "Fast personal nutrition tracking with protein front and centre, a reusable food library, AI photo estimates you review, and gap-based food suggestions. Your data stays on your device.",
  manifest: "/manifest.json",
  appleWebApp: { capable: true, title: "EATflix", statusBarStyle: "black-translucent" },
};

export const viewport: Viewport = {
  themeColor: "#080c14",
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800&display=swap" rel="stylesheet" />
      </head>
      <body className="bg-dark-bg text-foreground min-h-screen flex flex-col antialiased">
        <ServiceWorkerRegister />
        <SyncProvider />
        {children}
      </body>
    </html>
  );
}
