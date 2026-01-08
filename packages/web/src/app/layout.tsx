import type { Metadata, Viewport } from "next";
import { ThemeProvider } from "@/components/ThemeProvider";
import { ToastProvider } from "@/components/Toast";
import { QueryProvider } from "@/components/QueryProvider";
import { AuthProvider } from "@/components/AuthProvider";
import { TopicProvider } from "@/components/TopicProvider";
import { t } from "@/lib/i18n";
import { themeInitScript } from "@/lib/theme";
import "@/styles/globals.css";

export const metadata: Metadata = {
  title: {
    default: "Aha Radar - Surface signal from noise",
    template: "%s | Aha Radar",
  },
  description:
    "Personalized content aggregation that monitors your chosen sources and delivers curated digests of only the most relevant content.",
  keywords: ["content aggregation", "personalization", "news radar", "digest", "RSS", "content curation"],
  authors: [{ name: "Aha Radar" }],
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    type: "website",
    locale: "en_US",
    siteName: "Aha Radar",
    title: "Aha Radar - Surface signal from noise",
    description:
      "Personalized content aggregation that monitors your chosen sources and delivers curated digests of only the most relevant content.",
  },
  twitter: {
    card: "summary_large_image",
    title: "Aha Radar - Surface signal from noise",
    description:
      "Personalized content aggregation that monitors your chosen sources and delivers curated digests of only the most relevant content.",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#1a1d21" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        {/* Prevent flash of unstyled content by setting theme before paint */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
      </head>
      <body>
        {/* Skip to main content link for accessibility */}
        <a href="#main-content" className="skip-link">
          {t("accessibility.skipToContent")}
        </a>

        <QueryProvider>
          <AuthProvider>
            <TopicProvider>
              <ThemeProvider>
                <ToastProvider>{children}</ToastProvider>
              </ThemeProvider>
            </TopicProvider>
          </AuthProvider>
        </QueryProvider>
      </body>
    </html>
  );
}
