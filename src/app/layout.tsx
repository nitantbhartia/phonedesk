import type { Metadata } from "next";
import { DM_Sans, IBM_Plex_Mono, Space_Grotesk } from "next/font/google";
import { Suspense } from "react";
import "./globals.css";
import { GoogleAnalytics } from "@/components/google-analytics";
import { Providers } from "@/components/providers";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-sans",
});

const spaceGrotesk = Space_Grotesk({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
  variable: "--font-display",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
  variable: "--font-mono",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ringpaw.com";

export const metadata: Metadata = {
  title: "Call Slot — Your voicemail can book.",
  description:
    "Forward missed calls to Call Slot. Callers pick a time on the keypad, and the booking writes to your calendar.",
  metadataBase: new URL(APP_URL),
  openGraph: {
    title: "Call Slot — Your voicemail can book.",
    description:
      "Forward missed calls to Call Slot. Callers pick a time on the keypad, and the booking writes to your calendar.",
    url: APP_URL,
    siteName: "Call Slot",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Call Slot — Your voicemail can book.",
    description:
      "Forward missed calls to Call Slot. Callers pick a time on the keypad, and the booking writes to your calendar.",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const googleAnalyticsId = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;

  return (
    <html lang="en">
      <body
        className={`${dmSans.variable} ${spaceGrotesk.variable} ${plexMono.variable} font-sans bg-paper text-ink antialiased`}
      >
        {googleAnalyticsId ? (
          <Suspense fallback={null}>
            <GoogleAnalytics measurementId={googleAnalyticsId} />
          </Suspense>
        ) : null}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
