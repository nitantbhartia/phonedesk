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
        <div className="flex min-h-screen items-center justify-center bg-paper text-[13px] text-muted">
          Loading
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
      <div className="flex min-h-screen items-center justify-center bg-paper text-[13px] text-muted">
        Loading
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex h-[4.25rem] max-w-5xl items-center justify-between px-6 sm:px-8">
          <BrandLogo className="text-[1.4rem] sm:text-[1.45rem]" />
          <Link href="/" className="text-[12px] tracking-[0.04em] text-muted hover:text-ink">
            Back
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-5xl gap-16 px-6 py-16 sm:px-8 sm:py-24 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-6">
          <h1 className="font-display text-[2.75rem] leading-[0.98] tracking-[-0.02em] sm:text-6xl">
            Your voicemail
            <br />
            can book.
          </h1>
          <p className="mt-7 max-w-[24rem] text-[16px] leading-[1.55] text-muted">
            Call Slot picks up missed calls for your shop. Callers book a real calendar opening on the keypad.
          </p>
        </div>
        <div className="lg:col-span-6 lg:pt-1">
          <AuthPanel initialMode={initialMode} />
        </div>
      </div>
    </div>
  );
}
