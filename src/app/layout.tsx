import type { Metadata } from "next";
import { Outfit } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";

const outfit = Outfit({
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
  display: "swap",
});

export const metadata: Metadata = {
  title: "RingPaw - Voice AI Receptionist for Pet Groomers",
  description:
    "Never miss a booking. AI answers your calls, books appointments, and texts you summaries.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${outfit.className} font-sans antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
