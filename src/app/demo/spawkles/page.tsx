import type { Metadata } from "next";
import { SpawklesDemoClient } from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Spawkles Mobile Dog Grooming — RingPaw Demo",
  description: "Hear RingPaw turn a missed call into a booked appointment for Spawkles Mobile Dog Grooming.",
  robots: "noindex, nofollow",
};

export default function SpawklesDemoPage() {
  return <SpawklesDemoClient />;
}
