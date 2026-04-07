import type { Metadata } from "next";
import { SpawklesDemoClient } from "./client";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Spawkles Mobile Dog Grooming — RingPaw Demo",
  description: "Try Pip, your phone receptionist for Spawkles Mobile Dog Grooming.",
  robots: "noindex, nofollow",
};

export default function SpawklesDemoPage() {
  return <SpawklesDemoClient />;
}
