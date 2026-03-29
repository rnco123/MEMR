import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { Toaster } from "sonner";
// Import Sentry client-side configuration
import "../sentry.client.config";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MyclinicMD - Electronic Medical Records",
  description: "MyclinicMD - Modern EMR system with video conferencing powered by Supabase and Daily.co",
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: "/myclinic-md-logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className={inter.className}>
        {/* Beta Version Ticker */}
        <div className="beta-ticker">
          <div className="beta-ticker-content">
            <span>⚠️ THIS VERSION OF MCM EMR IS A BETA VERSION — NOT READY FOR PRODUCTION ⚠️</span>
            <span>⚠️ THIS VERSION OF MCM EMR IS A BETA VERSION — NOT READY FOR PRODUCTION ⚠️</span>
            <span>⚠️ THIS VERSION OF MCM EMR IS A BETA VERSION — NOT READY FOR PRODUCTION ⚠️</span>
            <span>⚠️ THIS VERSION OF MCM EMR IS A BETA VERSION — NOT READY FOR PRODUCTION ⚠️</span>
          </div>
        </div>
        <ErrorBoundary>
          <AuthProvider>{children}</AuthProvider>
        </ErrorBoundary>
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
