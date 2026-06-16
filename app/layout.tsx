import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { AuthProvider } from "@/lib/auth-context";
import { UserProfileProvider } from "@/lib/user-profile-context";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { I18nProvider } from "@/lib/i18n";
import { ServiceWorkerRegister } from "@/components/pwa/ServiceWorkerRegister";
import { Toaster } from "sonner";
// Import Sentry client-side configuration
import "../sentry.client.config";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "MyclinicMD - Electronic Medical Records",
  description: "MyclinicMD - Modern EMR system with video conferencing powered by Supabase and Daily.co",
  applicationName: "MyclinicMD",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "MyclinicMD",
  },
  icons: {
    icon: [{ url: "/favicon.svg", type: "image/svg+xml" }],
    apple: "/myclinic-md-logo.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#2E6EF3",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        <ErrorBoundary>
          <I18nProvider>
            <AuthProvider>
              <UserProfileProvider>{children}</UserProfileProvider>
            </AuthProvider>
          </I18nProvider>
        </ErrorBoundary>
        <Toaster richColors position="top-center" />
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
