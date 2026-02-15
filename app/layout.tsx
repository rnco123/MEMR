import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
// Import Sentry client-side configuration
import "../sentry.client.config";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MyclinicMD - Electronic Medical Records",
  description: "MyclinicMD - Modern EMR system with video conferencing powered by Supabase and Daily.co",
  icons: {
    icon: "/favicon.svg",
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
        <ErrorBoundary>
          <AuthProvider>{children}</AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  );
}
