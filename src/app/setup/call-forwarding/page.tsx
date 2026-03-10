"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * This standalone page is superseded by the onboarding flow.
 * Redirect authenticated users to the call-forwarding step (step 8)
 * of /onboarding so they see the same consistent UI.
 * Unauthenticated visitors are sent to the home page.
 */
export default function CallForwardingSetupPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
    } else if (status === "authenticated") {
      router.replace("/onboarding?step=8");
    }
  }, [status, router]);

  return (
    <div className="min-h-screen bg-paw-sky flex items-center justify-center">
      <div className="animate-pulse text-paw-brown/50 font-medium">
        Loading...
      </div>
    </div>
  );
}
