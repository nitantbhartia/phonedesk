"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

/**
 * Redirects to the call-forwarding step of the onboarding flow (step 8),
 * but only if the business already has a RingPaw number provisioned.
 * If not, redirects to step 4 (Get Number) so they provision one first.
 * Unauthenticated visitors are sent to the home page.
 */
export default function CallForwardingSetupPage() {
  const { status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === "unauthenticated") {
      router.replace("/");
      return;
    }

    if (status !== "authenticated") return;

    async function redirect() {
      try {
        const res = await fetch("/api/business/profile");
        if (res.ok) {
          const data = await res.json();
          const hasNumber = Boolean(data.business?.phoneNumber?.number);
          router.replace(hasNumber ? "/onboarding?step=8" : "/onboarding?step=4");
        } else {
          router.replace("/onboarding?step=4");
        }
      } catch {
        router.replace("/onboarding?step=4");
      }
    }

    void redirect();
  }, [status, router]);

  return (
    <div className="min-h-screen bg-paw-sky flex items-center justify-center">
      <div className="animate-pulse text-paw-brown/50 font-medium">
        Loading...
      </div>
    </div>
  );
}
