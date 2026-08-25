"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";

export default function LandingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-paper" />}>
      <LandingPageContent />
    </Suspense>
  );
}

function LandingPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [isResolvingRedirect, setIsResolvingRedirect] = useState(false);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;
    const resolvePostAuthRoute = async () => {
      setIsResolvingRedirect(true);
      try {
        const response = await fetch("/api/business/profile");
        if (!response.ok) throw new Error("Failed to load business profile");
        const data = await response.json();
        if (!cancelled) router.push(data.business ? "/dashboard" : "/onboarding");
      } catch {
        if (!cancelled) router.push("/onboarding");
      } finally {
        if (!cancelled) setIsResolvingRedirect(false);
      }
    };

    void resolvePostAuthRoute();
    return () => {
      cancelled = true;
    };
  }, [session, router]);

  if (status === "loading" || isResolvingRedirect) {
    return <div className="min-h-screen bg-paper" />;
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="mx-auto flex max-w-6xl items-center justify-between px-6 py-7 sm:px-10">
        <BrandLogo className="text-[1.45rem]" />
        <Link href="/login?mode=signin" className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted hover:text-ink">
          Log in
        </Link>
      </header>

      <main className="mx-auto flex min-h-[calc(100vh-5.75rem)] max-w-6xl flex-col px-6 pb-10 pt-10 sm:px-10 sm:pt-16">
        <div className="flex flex-1 flex-col justify-center">
          <p className="mb-8 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">
            A telephone prompt for the busy hour
          </p>
          <section className="border-y border-line bg-surface px-5 py-8 sm:px-10 sm:py-12 lg:px-16 lg:py-14">
            <pre className="whitespace-pre-wrap font-mono text-[clamp(1.05rem,2.5vw,1.65rem)] leading-[1.8] tracking-[-0.02em] text-ink">
{`Riverside Grooming.

Thank you for calling.

To book the next opening,
press 1.

Thursday, 2:00 PM.
Friday, 10:30 AM.

Press 9 to leave a message.`}
            </pre>
          </section>
          <div className="mt-8 flex flex-col gap-6 sm:flex-row sm:items-end sm:justify-between">
            <p className="max-w-[31rem] text-[15px] leading-[1.6] text-muted">
              Call Slot turns an unanswered call into a confirmed time on your calendar, one press at a time.
            </p>
            <Link
              href="/login"
              className="inline-flex w-fit bg-accent px-5 py-3 text-[12px] tracking-[0.04em] text-accent-foreground hover:bg-accent-hover"
            >
              Put it on the line
            </Link>
          </div>
        </div>

        <footer className="mt-12 flex items-end justify-between border-t border-line pt-4 font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
          <span>$79 / month · one shop · one number</span>
          <span className="hidden sm:inline">ringpaw.com</span>
        </footer>
      </main>
    </div>
  );
}
