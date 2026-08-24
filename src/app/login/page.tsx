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
        <div className="min-h-screen flex items-center justify-center bg-paper">
          <div className="animate-pulse text-muted">Loading...</div>
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
      <div className="min-h-screen flex items-center justify-center bg-paper">
        <div className="animate-pulse text-muted">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper px-5 py-8 text-ink sm:px-8">
      <div className="mx-auto flex max-w-5xl items-center justify-between">
        <BrandLogo priority />
        <Link href="/" className="text-[13px] text-muted hover:text-ink">
          Back
        </Link>
      </div>

      <div className="mx-auto mt-16 grid max-w-5xl gap-14 lg:grid-cols-[1.1fr_0.9fr] lg:items-center">
        <div>
          <h1 className="font-display text-4xl leading-[1.1] tracking-tight sm:text-5xl">
            Stop losing bookings to missed calls.
          </h1>
          <p className="mt-5 max-w-md text-[16px] leading-relaxed text-muted">
            Call Slot picks up missed calls for your shop. Callers book a real calendar opening on the keypad, and you get a text confirmation.
          </p>
        </div>

        <AuthPanel initialMode={initialMode} />
      </div>
    </div>
  );
}
