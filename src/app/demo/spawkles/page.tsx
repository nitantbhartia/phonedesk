import type { Metadata } from "next";
import { SpawklesDemoClient } from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Spawkles Mobile Dog Grooming — Call Slot Demo",
  description: "Hear Call Slot pick up for Spawkles Mobile Dog Grooming.",
  robots: "noindex, nofollow",
};

export default function SpawklesDemoPage() {
  return <SpawklesDemoClient />;
}
