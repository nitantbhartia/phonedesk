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
    <div className="min-h-screen overflow-hidden bg-paper text-ink">
      <header className="border-b border-line">
        <nav className="mx-auto flex max-w-[1280px] items-center justify-between px-6 py-5 sm:px-10 lg:px-12">
          <BrandLogo />
          <div className="hidden items-center gap-8 text-[12px] font-semibold tracking-[0.03em] text-muted md:flex">
            <a href="#how-it-works" className="studio-link">How it works</a>
            <a href="#why-call-slot" className="studio-link">Why Call Slot</a>
            <a href="#price" className="studio-link">Price</a>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/login?mode=signin" className="hidden text-[12px] font-semibold text-muted hover:text-ink sm:inline">
              Log in
            </Link>
            <Link href="/onboarding" className="studio-button studio-button-small">
              Start <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-[1280px] gap-12 px-6 pb-16 pt-12 sm:px-10 sm:pb-24 sm:pt-20 lg:grid-cols-[0.93fr_1.07fr] lg:items-center lg:gap-16 lg:px-12 lg:pt-24">
          <div>
            <p className="studio-eyebrow mb-7">
              <span className="studio-eyebrow-line" />
              Bookable voicemail <span>/</span> missed calls <span>/</span> keypad
            </p>
            <h1 className="max-w-[650px] text-[clamp(3.4rem,7vw,6.9rem)] font-bold leading-[0.89] tracking-[-0.075em]">
              Your voicemail can <span className="text-accent">book.</span>
            </h1>
            <p className="mt-8 max-w-[440px] text-[17px] leading-[1.55] text-muted sm:text-[18px]">
              When your hands are wet and the phone rings, Call Slot answers with two real openings from your calendar. The caller presses a digit. You get the booking.
            </p>
            <div className="mt-9 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <Link href="/onboarding" className="studio-button">
                Get a number <span aria-hidden="true">↗</span>
              </Link>
              <a href="#how-it-works" className="studio-text-link">
                See how it works <span aria-hidden="true">↓</span>
              </a>
            </div>
            <div className="mt-14 grid max-w-[560px] grid-cols-3 border-t border-line pt-5">
              <div>
                <p className="studio-fact-label">$79/mo</p>
                <p className="studio-fact-detail">one clear price</p>
              </div>
              <div className="border-l border-line pl-4 sm:pl-6">
                <p className="studio-fact-label">one shop</p>
                <p className="studio-fact-detail">one forwarded line</p>
              </div>
              <div className="border-l border-line pl-4 sm:pl-6">
                <p className="studio-fact-label">one booking</p>
                <p className="studio-fact-detail">or you don&apos;t pay</p>
              </div>
            </div>
          </div>

          <div className="studio-illustration relative min-h-[470px] overflow-hidden sm:min-h-[590px]">
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 700 650"
              fill="none"
              role="img"
              aria-labelledby="call-slot-illustration-title call-slot-illustration-desc"
              preserveAspectRatio="xMidYMid slice"
            >
              <title id="call-slot-illustration-title">A keypad turning a missed call into two bookable openings</title>
              <desc id="call-slot-illustration-desc">An original geometric illustration with a telephone, a sunny dial, and two calendar openings.</desc>
              <defs>
                <pattern id="diagonal-grid" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <path d="M0 0V28" stroke="#D7E7E1" strokeOpacity=".27" />
                </pattern>
                <filter id="soft-shadow" x="-30%" y="-30%" width="160%" height="160%">
                  <feDropShadow dx="0" dy="18" stdDeviation="14" floodColor="#153F3B" floodOpacity=".2" />
                </filter>
              </defs>
              <rect width="700" height="650" fill="#89B7B5" />
              <rect width="700" height="650" fill="url(#diagonal-grid)" />
              <circle cx="530" cy="145" r="116" fill="#F1B248" />
              <circle cx="530" cy="145" r="146" stroke="#F1B248" strokeOpacity=".2" strokeWidth="16" />
              <path d="M34 470L287 194L621 470" stroke="#123A38" strokeWidth="18" strokeLinejoin="round" />
              <path d="M78 470L287 244L560 470" fill="#D46C49" stroke="#F2C27A" strokeWidth="8" strokeLinejoin="round" />
              <path d="M132 429L287 288L443 429M193 429L287 345L378 429" stroke="#F5C977" strokeWidth="6" />
              <path d="M27 480H625L604 532H54L27 480Z" fill="#123A38" stroke="#123A38" strokeWidth="8" strokeLinejoin="round" />
              <path d="M60 503H593" stroke="#F1B248" strokeWidth="7" />
              <path d="M57 526H587" stroke="#D46C49" strokeWidth="5" />
              <g filter="url(#soft-shadow)">
                <rect x="378" y="300" width="222" height="240" rx="10" fill="#F8F3E9" stroke="#123A38" strokeWidth="8" />
                <rect x="378" y="300" width="222" height="46" fill="#123A38" />
                <circle cx="406" cy="323" r="7" fill="#F1B248" />
                <path d="M428 323H557" stroke="#D7E7E1" strokeWidth="4" strokeLinecap="round" />
                <rect x="403" y="368" width="172" height="53" rx="5" fill="#DCECE5" />
                <rect x="403" y="436" width="172" height="76" rx="5" fill="#F1B248" />
                <circle cx="426" cy="394" r="12" fill="#D46C49" />
                <path d="M420 394H432M426 388V400" stroke="#F8F3E9" strokeWidth="3" strokeLinecap="round" />
                <circle cx="427" cy="462" r="11" fill="#123A38" />
                <path d="M421 462L425 466L434 456" stroke="#F8F3E9" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <path d="M451 387H550M451 402H520" stroke="#123A38" strokeWidth="6" strokeLinecap="round" />
                <path d="M451 458H554M451 477H530M451 494H505" stroke="#123A38" strokeWidth="6" strokeLinecap="round" />
              </g>
              <g transform="translate(82 72)">
                <rect width="145" height="110" fill="#F8F3E9" stroke="#123A38" strokeWidth="5" />
                <path d="M22 72C22 51 39 34 60 34H65C86 34 103 51 103 72" stroke="#D46C49" strokeWidth="8" />
                <path d="M22 72H39V88H22V72ZM86 72H103V88H86V72Z" fill="#D46C49" />
                <path d="M60 33V18M48 36L37 23M72 36L83 23" stroke="#123A38" strokeWidth="5" strokeLinecap="round" />
                <text x="18" y="103" fill="#123A38" fontSize="10" fontFamily="monospace" letterSpacing="2">MISSED CALL</text>
              </g>
              <g transform="translate(45 564)">
                <path d="M0 0H220" stroke="#F8F3E9" strokeWidth="2" />
                <text y="27" fill="#F8F3E9" fontSize="12" fontFamily="monospace" letterSpacing="2">01  /  TWO OPENINGS</text>
              </g>
              <g transform="translate(590 560) rotate(-12)">
                <circle cx="0" cy="0" r="38" fill="#F8F3E9" fillOpacity=".2" stroke="#123A38" strokeWidth="3" />
                <text x="-18" y="-3" fill="#123A38" fontSize="16" fontWeight="700" fontFamily="sans-serif">CS</text>
                <text x="-19" y="14" fill="#123A38" fontSize="7" fontFamily="monospace">READY</text>
              </g>
            </svg>
            <div className="absolute left-6 top-6 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-[#F8F3E9]/80 sm:left-8 sm:top-8">
              01 / keypad to calendar
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-[1280px] gap-5 px-6 py-8 sm:grid-cols-3 sm:px-10 lg:px-12">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Built for the busy hour</p>
            <p className="text-sm leading-[1.55] text-muted">No app for callers. No dashboard gymnastics for you. Just a short phone tree connected to the calendar you already use.</p>
            <p className="text-sm leading-[1.55] text-muted sm:border-l sm:border-line sm:pl-6">Forward your missed calls, keep your number, and let the phone do the small work that costs you bookings.</p>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-[1280px] px-6 py-20 sm:px-10 sm:py-28 lg:px-12">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <p className="studio-eyebrow mb-5"><span className="studio-eyebrow-line" />How it works</p>
              <h2 className="max-w-[370px] text-4xl font-bold leading-[0.95] tracking-[-0.055em] sm:text-6xl">
                Three moves.<br /><span className="text-accent">No lost caller.</span>
              </h2>
              <p className="mt-6 max-w-[320px] text-[15px] leading-[1.6] text-muted">
                It sounds like your shop, offers times that are actually free, and leaves you with the confirmation.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <article className="studio-process-card">
                <span className="studio-number">01</span>
                <div className="studio-symbol"><PhoneSymbol /></div>
                <h3>Forward</h3>
                <p>When you can&apos;t pick up, your existing line sends the call to Call Slot.</p>
              </article>
              <article className="studio-process-card studio-process-card-dark">
                <span className="studio-number">02</span>
                <div className="studio-symbol"><KeypadSymbol /></div>
                <h3>Press</h3>
                <p>Callers hear your shop name, then press 1 to book or 9 to leave a message.</p>
              </article>
              <article className="studio-process-card studio-process-card-wide">
                <span className="studio-number">03</span>
                <div className="studio-symbol"><CalendarSymbol /></div>
                <div>
                  <h3>Calendar</h3>
                  <p>The appointment writes to your live calendar. The caller gets a confirmation text. You keep working.</p>
                </div>
                <span className="studio-card-arrow" aria-hidden="true">↗</span>
              </article>
            </div>
          </div>
        </section>

        <section id="why-call-slot" className="bg-ink text-paper">
          <div className="mx-auto grid max-w-[1280px] gap-12 px-6 py-20 sm:px-10 sm:py-28 lg:grid-cols-[1fr_1fr] lg:items-end lg:px-12">
            <div>
              <p className="studio-eyebrow studio-eyebrow-light mb-6"><span className="studio-eyebrow-line" />The Call Slot promise</p>
              <h2 className="max-w-[620px] text-4xl font-bold leading-[0.93] tracking-[-0.06em] sm:text-6xl">
                Your phone should<br />earn its keep.
              </h2>
            </div>
            <div className="lg:justify-self-end">
              <p className="max-w-[390px] text-[18px] leading-[1.55] text-paper/70">
                One booked appointment pays for the month. If Call Slot doesn&apos;t book one, you don&apos;t pay for one.
              </p>
              <Link href="/onboarding" className="studio-button studio-button-light mt-8">
                Start with your number <span aria-hidden="true">↗</span>
              </Link>
            </div>
          </div>
        </section>

        <section id="price" className="mx-auto max-w-[1280px] px-6 py-20 sm:px-10 sm:py-28 lg:px-12">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="studio-eyebrow mb-5"><span className="studio-eyebrow-line" />One simple plan</p>
              <h2 className="text-4xl font-bold leading-[0.95] tracking-[-0.055em] sm:text-6xl">A small line item.<br /><span className="text-accent">A full calendar.</span></h2>
            </div>
            <div className="flex flex-col justify-between gap-8 border-t border-line pt-7 sm:flex-row sm:items-end">
              <div>
                <p className="text-[clamp(4.5rem,10vw,8rem)] font-bold leading-[0.8] tracking-[-0.08em]">$79</p>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">per month / one shop / one number</p>
              </div>
              <div className="max-w-[260px]">
                <p className="text-[15px] leading-[1.6] text-muted">Forward missed calls. Keep real openings moving. Cancel any time.</p>
                <Link href="/onboarding" className="studio-text-link mt-5">Get set up <span aria-hidden="true">↗</span></Link>
              </div>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-line">
        <div className="mx-auto flex max-w-[1280px] flex-col gap-5 px-6 py-7 sm:flex-row sm:items-center sm:justify-between sm:px-10 lg:px-12">
          <div className="flex items-center gap-4">
            <BrandLogo href={null} />
            <span className="h-4 w-px bg-line" />
            <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-muted">ringpaw.com</span>
          </div>
          <div className="flex gap-5 font-mono text-[10px] uppercase tracking-[0.14em] text-muted">
            <Link href="/privacy-policy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <span>© {new Date().getFullYear()} Call Slot</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function PhoneSymbol() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <path d="M15 8h7l3 9-5 3c2 5 5 8 10 10l3-5 9 3v7c0 3-2 5-5 5C21 40 8 27 8 11c0-3 2-3 7-3Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M31 9h9v9M40 9 29 20" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function KeypadSymbol() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="7" y="5" width="34" height="38" rx="3" stroke="currentColor" strokeWidth="2.5" />
      <circle cx="16" cy="15" r="2" fill="currentColor" /><circle cx="24" cy="15" r="2" fill="currentColor" /><circle cx="32" cy="15" r="2" fill="currentColor" />
      <circle cx="16" cy="24" r="2" fill="currentColor" /><circle cx="24" cy="24" r="2" fill="currentColor" /><circle cx="32" cy="24" r="2" fill="currentColor" />
      <circle cx="16" cy="33" r="2" fill="currentColor" /><circle cx="24" cy="33" r="2" fill="currentColor" /><circle cx="32" cy="33" r="2" fill="currentColor" />
    </svg>
  );
}

function CalendarSymbol() {
  return (
    <svg viewBox="0 0 48 48" fill="none" aria-hidden="true">
      <rect x="7" y="10" width="34" height="31" rx="3" stroke="currentColor" strokeWidth="2.5" />
      <path d="M7 19h34M16 6v8M32 6v8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="m16 29 5 5 11-11" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
