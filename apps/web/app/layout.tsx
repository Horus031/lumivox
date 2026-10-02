import "@livekit/components-styles";
import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import "./globals.css";
import { Toaster } from "sonner";
import { isSearchIndexingEnabled, siteConfig } from "@/lib/seo/site-config";
import { GoogleAnalytics } from "@next/third-parties/google";
import { Plus_Jakarta_Sans } from "next/font/google";

export const metadata: Metadata = {
  metadataBase: new URL(siteConfig.url),

  title: {
    default: siteConfig.defaultTitle,
    template: "%s | Lumivox",
  },

  description: siteConfig.defaultDescription,

  applicationName: siteConfig.name,

  category: "education",

  robots: isSearchIndexingEnabled
    ? {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          "max-image-preview": "large",
          "max-snippet": -1,
          "max-video-preview": -1,
        },
      }
    : {
        index: false,
        follow: false,
      },
};

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin", "vietnamese"],
  display: "swap",
  variable: "--font-plus-jakarta",
});

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const gaId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <html lang="en" className={plusJakarta.variable} suppressHydrationWarning>
      <body className="antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="system"
          enableSystem
          disableTransitionOnChange
        >
          {children}

          <Toaster richColors position="top-right" closeButton />
        </ThemeProvider>
      </body>

      {gaId ? <GoogleAnalytics gaId={gaId} /> : null}
    </html>
  );
}
