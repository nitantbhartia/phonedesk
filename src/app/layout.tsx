import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { GoogleAnalytics } from "@/components/google-analytics";
import { Providers } from "@/components/providers";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

const APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://ringpaw.com";

export const metadata: Metadata = {
  title: "RingPaw - Voice AI Receptionist for Pet Groomers",
  description:
    "Never miss a booking. AI answers your calls, books appointments, and texts you summaries.",
  metadataBase: new URL(APP_URL),
  openGraph: {
    title: "RingPaw - AI Receptionist for Pet Groomers",
    description:
      "Never miss a booking. AI answers your calls, books appointments, and texts confirmations — 24/7.",
    url: APP_URL,
    siteName: "RingPaw",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "RingPaw - AI Receptionist for Pet Groomers",
    description:
      "Never miss a booking. AI answers your calls, books appointments, and texts confirmations — 24/7.",
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
      <body className={`${outfit.className} font-sans antialiased`}>
        {googleAnalyticsId ? (
          <GoogleAnalytics measurementId={googleAnalyticsId} />
        ) : null}
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
