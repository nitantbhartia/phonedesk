"use client";

import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { AuthPanel } from "@/components/auth-panel";

export default function AuthPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center bg-paw-sky">
          <div className="animate-pulse text-paw-brown/60">Loading...</div>
        </div>
      }
    >
      <AuthPageContent />
    </Suspense>
  );
}

function AuthPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const initialMode = searchParams.get("mode") === "signin" ? "signin" : "signup";

  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    const resolvePostAuthRoute = async () => {
      try {
        const response = await fetch("/api/business/profile");
        if (!response.ok) {
          throw new Error("Failed to load business profile");
        }

        const data = await response.json();
        if (!cancelled) {
          router.push(data.business ? "/dashboard" : "/onboarding");
        }
      } catch {
        if (!cancelled) {
          router.push("/onboarding");
        }
      }
    };

    void resolvePostAuthRoute();
    return () => {
      cancelled = true;
    };
  }, [session, router]);

  if (status === "loading" || !!session) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-paw-sky">
        <div className="animate-pulse text-paw-brown/60">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paw-sky px-4 py-6 text-paw-brown">
      <div className="mx-auto flex max-w-6xl items-center justify-between">
        <BrandLogo priority mobileWidth={156} desktopWidth={236} className="min-w-0 max-w-[156px] sm:max-w-[236px]" />
        <Link href="/" className="text-sm font-semibold text-paw-brown/70 hover:text-paw-brown">
          Back to home
        </Link>
      </div>

      <div className="mx-auto mt-10 grid max-w-6xl gap-10 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div className="space-y-6">
          <p className="inline-flex items-center gap-2 rounded-full border border-white/50 bg-paw-surface px-4 py-2 text-sm font-semibold">
            <span className="h-2 w-2 rounded-full bg-paw-orange animate-pulse" />
            Live in 5 minutes
          </p>
          <h1 className="text-4xl font-extrabold leading-tight sm:text-6xl">
            Stop losing bookings to missed calls.
          </h1>
          <p className="max-w-xl text-lg leading-relaxed text-paw-brown/75">
            RingPaw answers every call for your grooming business — booking appointments, collecting details, and texting confirmations while you focus on the dogs.
          </p>
          <ul className="space-y-3">
            {[
              "Pip picks up in seconds, 24/7",
              "Books appointments and texts confirmations automatically",
              "Setup takes 5 minutes, no tech skills needed",
            ].map((item) => (
              <li key={item} className="flex items-start gap-3 text-paw-brown/80">
                <span className="mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-paw-orange/15 text-paw-orange">
                  <svg width="11" height="9" viewBox="0 0 11 9" fill="none">
                    <path d="M1 4.5L4 7.5L10 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </span>
                <span className="text-base font-medium">{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <AuthPanel initialMode={initialMode} />
      </div>
    </div>
  );
}
