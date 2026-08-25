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
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7 sm:px-10">
        <div className="flex w-full items-center justify-between">
          <BrandLogo className="text-[1.4rem] sm:text-[1.45rem]" />
          <Link href="/" className="text-[12px] tracking-[0.04em] text-muted hover:text-ink">
            Back to ringpaw.com
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-6xl gap-16 px-6 py-16 sm:px-10 sm:py-24 lg:grid-cols-12 lg:items-start">
        <div className="lg:col-span-5">
          <p className="mb-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">Call Slot · ringpaw.com</p>
          <h1 className="font-display text-[3rem] leading-[0.95] tracking-[-0.02em] sm:text-6xl">
            Put your name
            <br />
            on the line.
          </h1>
          <p className="mt-7 max-w-[24rem] text-[16px] leading-[1.55] text-muted">
            A few details, then your unanswered calls can offer the next open time.
          </p>
        </div>
        <div className="lg:col-span-6 lg:col-start-7 lg:pt-1">
          <AuthPanel initialMode={initialMode} />
        </div>
      </div>
    </div>
  );
}
