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
    <div className="studio-auth min-h-screen bg-paper text-ink">
      <header className="studio-chrome-header">
        <div className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-5 sm:px-10 lg:px-12">
          <BrandLogo />
          <Link href="/" className="text-[12px] font-semibold text-muted hover:text-ink">
            Back to RingPaw
          </Link>
        </div>
      </header>

      <div className="mx-auto grid max-w-[1280px] gap-12 px-6 py-12 sm:px-10 sm:py-20 lg:grid-cols-[0.9fr_1.1fr] lg:items-center lg:gap-24 lg:px-12 lg:py-28">
        <div className="max-w-[490px]">
          <p className="studio-eyebrow mb-6"><span className="studio-eyebrow-line" />Account / RingPaw</p>
          <h1 className="max-w-[440px] text-5xl font-bold leading-[0.88] tracking-[-0.075em] sm:text-7xl">
            Keep the next<br /><span className="text-accent">call moving.</span>
          </h1>
          <p className="mt-7 max-w-[25rem] text-[16px] leading-[1.6] text-muted">
            Sign in to manage your number, calendar, and the next opening your callers hear.
          </p>
          <div className="mt-12 grid max-w-[390px] grid-cols-2 border-t border-line pt-5">
            <div>
              <p className="studio-fact-label">01</p>
              <p className="mt-2 text-sm text-muted">Connect your calendar</p>
            </div>
            <div className="border-l border-line pl-5">
              <p className="studio-fact-label">02</p>
              <p className="mt-2 text-sm text-muted">Book from the phone</p>
            </div>
          </div>
        </div>
        <div className="lg:justify-self-end">
          <AuthPanel initialMode={initialMode} />
        </div>
      </div>

      <footer className="border-t border-line px-6 py-6 sm:px-10 lg:px-12">
        <div className="mx-auto flex max-w-[1280px] justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
          <span>RingPaw / ringpaw.com</span>
          <span>Private account access</span>
        </div>
      </footer>
    </div>
  );
}
