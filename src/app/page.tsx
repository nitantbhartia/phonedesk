"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";

export default function LandingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-paper text-[13px] text-muted">
          Loading
        </div>
      }
    >
      <LandingPageContent />
    </Suspense>
  );
}

function LandingPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isResolvingRedirect, setIsResolvingRedirect] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    const resolvePostAuthRoute = async () => {
      setIsResolvingRedirect(true);

      try {
        const response = await fetch("/api/business/profile");
        if (!response.ok) {
          throw new Error("Failed to load business profile");
        }

        const data = await response.json();
        const hasBusiness = Boolean(data.business);

        if (!cancelled) {
          router.push(hasBusiness ? "/dashboard" : "/onboarding");
        }
      } catch {
        if (!cancelled) {
          router.push("/onboarding");
        }
      } finally {
        if (!cancelled) {
          setIsResolvingRedirect(false);
        }
      }
    };

    void resolvePostAuthRoute();

    return () => {
      cancelled = true;
    };
  }, [session, router, searchParams]);

  if (status === "loading" || isResolvingRedirect) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-paper text-[13px] text-muted">
        Loading
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line">
        <nav className="mx-auto flex h-[4.25rem] max-w-5xl items-center justify-between px-6 sm:px-8">
          <BrandLogo className="text-[1.4rem] sm:text-[1.45rem]" />
          <div className="hidden items-center gap-9 text-[12px] tracking-[0.04em] text-ink md:flex">
            <a href="#how-it-works" className="hover:text-accent">
              How it works
            </a>
            <a href="#price" className="hover:text-accent">
              Price
            </a>
          </div>
          <div className="hidden items-center gap-6 text-[12px] tracking-[0.04em] md:flex">
            <Link href="/login?mode=signin" className="text-muted hover:text-ink">
              Log in
            </Link>
            <Link
              href="/login"
              className="bg-accent px-3.5 py-2 text-accent-foreground hover:bg-accent-hover"
            >
              Start
            </Link>
          </div>
          <button
            className="p-1.5 text-ink md:hidden"
            onClick={() => setMobileMenuOpen((v) => !v)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            ) : (
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <line x1="4" x2="20" y1="7" y2="7" />
                <line x1="4" x2="20" y1="12" y2="12" />
                <line x1="4" x2="20" y1="17" y2="17" />
              </svg>
            )}
          </button>
        </nav>
        {mobileMenuOpen && (
          <div className="border-t border-line px-6 py-5 md:hidden">
            <div className="flex flex-col gap-4 text-[13px]">
              <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)}>
                How it works
              </a>
              <a href="#price" onClick={() => setMobileMenuOpen(false)}>
                Price
              </a>
              <Link href="/login?mode=signin" onClick={() => setMobileMenuOpen(false)} className="text-muted">
                Log in
              </Link>
              <Link
                href="/login"
                onClick={() => setMobileMenuOpen(false)}
                className="inline-block w-fit bg-accent px-3.5 py-2 text-[12px] text-accent-foreground"
              >
                Start
              </Link>
            </div>
          </div>
        )}
      </header>

      <main>
        <section className="mx-auto grid max-w-5xl gap-16 px-6 pb-24 pt-20 sm:px-8 sm:pb-28 sm:pt-24 lg:grid-cols-12 lg:items-start lg:gap-12">
          <div className="lg:col-span-7">
            <p className="mb-6 font-mono text-[10px] uppercase tracking-[0.22em] text-muted">Call Slot · ringpaw.com</p>
            <h1 className="font-display text-[3.15rem] leading-[0.96] tracking-[-0.02em] text-ink sm:text-[4.6rem] lg:text-[5.4rem]">
              Your voicemail
              <br />
              can book.
            </h1>
            <p className="mt-8 max-w-[26rem] text-[16px] leading-[1.55] text-muted">
              Missed calls forward to Call Slot. Callers hear two real openings, press a digit, and the booking writes to your calendar.
            </p>
            <div className="mt-10 flex items-center gap-7">
              <Link
                href="/login"
                className="bg-accent px-5 py-2.5 text-[12px] tracking-[0.04em] text-accent-foreground hover:bg-accent-hover"
              >
                Start
              </Link>
              <Link href="/login?mode=signin" className="text-[12px] tracking-[0.04em] text-muted hover:text-ink">
                Log in
              </Link>
            </div>
          </div>

          <aside className="border border-line bg-surface px-7 py-8 lg:col-span-5 lg:mt-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.22em] text-muted">What they hear</p>
            <pre className="mt-6 font-mono text-[13px] leading-[1.85] text-ink sm:text-[14px]">
{`Riverside Grooming.

Press 1 for Thursday  2:00.
Press 2 for Friday   10:30.
Press 9 and we'll call you back.`}
            </pre>
          </aside>
        </section>

        <section id="how-it-works" className="border-t border-line">
          <div className="mx-auto max-w-5xl px-6 py-20 sm:px-8 sm:py-24">
            <h2 className="font-display text-[2.15rem] tracking-tight sm:text-[2.75rem]">How it works</h2>
            <ol className="mt-12 border-t border-line">
              {[
                {
                  n: "01",
                  title: "Forward unanswered calls",
                  body: "You keep your shop number. Unanswered calls go to Call Slot.",
                },
                {
                  n: "02",
                  title: "They press a slot",
                  body: "Callers hear your shop name, then two real openings from your calendar.",
                },
                {
                  n: "03",
                  title: "It hits the calendar",
                  body: "The booking writes back. You and the caller get a confirmation text.",
                },
              ].map((step) => (
                <li
                  key={step.n}
                  className="grid grid-cols-[3.25rem_1fr] gap-6 border-b border-line py-8 sm:grid-cols-[4.5rem_1fr] sm:gap-10"
                >
                  <span className="font-mono text-[12px] text-accent">{step.n}</span>
                  <div>
                    <h3 className="text-[16px] font-medium tracking-tight">{step.title}</h3>
                    <p className="mt-1.5 max-w-xl text-[15px] leading-relaxed text-muted">{step.body}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section id="price" className="border-t border-line">
          <div className="mx-auto max-w-5xl px-6 py-20 sm:px-8 sm:py-24">
            <h2 className="font-display text-[2.15rem] tracking-tight sm:text-[2.75rem]">Price</h2>
            <p className="mt-10 font-display text-5xl leading-none tracking-tight sm:text-6xl">$79</p>
            <p className="mt-4 text-[16px] text-ink">a month. One shop, one number.</p>
            <p className="mt-2 text-[15px] text-muted">One booked appointment or you don&apos;t pay.</p>
            <Link
              href="/login"
              className="mt-10 inline-block bg-accent px-5 py-2.5 text-[12px] tracking-[0.04em] text-accent-foreground hover:bg-accent-hover"
            >
              Start
            </Link>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-5xl flex-col gap-3 px-6 py-7 text-[12px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-8">
          <div className="flex items-baseline gap-4">
            <BrandLogo href="/" className="text-[1.15rem] sm:text-[1.2rem]" />
            <span>ringpaw.com</span>
          </div>
          <div className="flex gap-5">
            <Link href="/privacy-policy" className="hover:text-ink">
              Privacy
            </Link>
            <Link href="/terms" className="hover:text-ink">
              Terms
            </Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
