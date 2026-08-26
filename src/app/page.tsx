"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { ArrowIcon } from "@/components/arrow-icon";

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
  const [isHeaderScrolled, setIsHeaderScrolled] = useState(false);

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

  useEffect(() => {
    const handleScroll = () => setIsHeaderScrolled(window.scrollY > 12);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  if (status === "loading" || isResolvingRedirect) {
    return <div className="min-h-screen bg-paper" />;
  }

  return (
    <div className="studio-site min-h-screen overflow-x-clip bg-paper text-ink">
      <header className={`studio-header ${isHeaderScrolled ? "studio-header-scrolled" : ""}`}>
        <nav className="studio-nav mx-auto flex max-w-[1280px] items-center justify-between px-6 py-5 sm:px-10 lg:px-12">
          <BrandLogo />
          <div className="hidden items-center gap-8 text-[12px] font-semibold tracking-[0.03em] text-muted md:flex">
            <a href="#how-it-works" className="studio-link">How it works</a>
            <a href="#why-ringpaw" className="studio-link">Why RingPaw</a>
            <a href="#price" className="studio-link">Price</a>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/login?mode=signin" className="hidden text-[12px] font-semibold text-muted hover:text-ink sm:inline">
              Log in
            </Link>
            <Link href="/demo" className="studio-button studio-button-small">
              Hear RingPaw <ArrowIcon className="h-4 w-4" />
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-[1280px] gap-12 px-6 pb-16 pt-12 sm:px-10 sm:pb-24 sm:pt-20 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:gap-16 lg:px-12 lg:pt-24">
          <div>
            <p className="studio-eyebrow mb-7">
              <span className="studio-eyebrow-line" />
              Built for pet groomers <span>/</span> missed calls <span>/</span> booked grooms
            </p>
            <h1 className="max-w-[680px] text-[clamp(3.1rem,5.3vw,5.5rem)] font-bold leading-[0.9] tracking-[-0.068em]">
              Busy grooming dogs? <span className="text-accent">Missed calls become booked grooms.</span>
            </h1>
            <p className="mt-8 max-w-[490px] text-[17px] leading-[1.55] text-muted sm:text-[18px]">
              RingPaw answers missed grooming calls, offers real openings from your calendar, books the appointment, and sends the confirmation — while you stay with the dog on your table.
            </p>
            <div className="mt-9 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <Link href="/demo" className="studio-button">
                Hear RingPaw book a groom <ArrowIcon className="h-4 w-4" />
              </Link>
              <Link href="/onboarding" className="studio-text-link">
                Set up my shop <ArrowIcon className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-14 grid max-w-[560px] grid-cols-3 border-t border-line pt-5">
              <div>
                <p className="studio-fact-label">$79/mo</p>
                <p className="studio-fact-detail">one clear price</p>
              </div>
              <div className="border-l border-line pl-4 sm:pl-6">
                <p className="studio-fact-label">keep your number</p>
                <p className="studio-fact-detail">forward only missed calls</p>
              </div>
              <div className="border-l border-line pl-4 sm:pl-6">
                <p className="studio-fact-label">one booking</p>
                <p className="studio-fact-detail">can cover the month</p>
              </div>
            </div>
          </div>

          <div className="studio-illustration relative aspect-[1.08] overflow-hidden">
            <svg
              className="absolute inset-0 h-full w-full"
              viewBox="0 0 700 620"
              fill="none"
              role="img"
              aria-labelledby="ringpaw-illustration-title ringpaw-illustration-desc"
              preserveAspectRatio="xMidYMid meet"
            >
              <title id="ringpaw-illustration-title">RingPaw turning a missed grooming call into a booked appointment</title>
              <desc id="ringpaw-illustration-desc">A telephone keypad offers two real grooming openings from the shop calendar.</desc>
              <defs>
                <pattern id="diagonal-grid" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <path d="M0 0V28" stroke="#D8D0C4" strokeOpacity=".55" />
                </pattern>
              </defs>
              <rect width="700" height="620" fill="#F3EEE4" />
              <rect width="700" height="620" fill="url(#diagonal-grid)" />
              <g transform="translate(528 126)">
                <circle r="108" fill="#FAF7F1" />
                <circle r="136" fill="none" stroke="#D8D0C4" strokeOpacity=".85" strokeWidth="14" />
                <circle r="74" fill="none" stroke="#1C1916" strokeOpacity=".75" strokeWidth="3" />
                <path d="M0-94V-76M94 0H76M0 94V76M-94 0H-76M67-67L54-54M67 67L54 54M-67 67L-54 54M-67-67L-54-54" stroke="#1C1916" strokeWidth="4" />
                <circle r="12" fill="#1C1916" />
                <path d="M0 0V-46M0 0L32 20" stroke="#1C1916" strokeWidth="5" strokeLinecap="round" />
                <text x="-26" y="158" fill="#1C1916" fontSize="11" fontFamily="monospace" letterSpacing="2">DIAL</text>
              </g>
              <g>
                <path d="M153 196C153 158 184 130 222 130H378C416 130 447 158 447 196" stroke="#1C1916" strokeWidth="26" strokeLinecap="round" />
                <path d="M150 181H188V223H150V181ZM412 181H450V223H412V181Z" fill="#D46C49" stroke="#1C1916" strokeWidth="6" />
                <rect x="144" y="205" width="312" height="358" fill="#F8F3E9" stroke="#1C1916" strokeWidth="9" />
                <rect x="144" y="205" width="312" height="65" fill="#1C1916" />
                <circle cx="177" cy="237" r="8" fill="#F1B248" />
                <path d="M205 237H391" stroke="#F3EEE4" strokeWidth="4" />
                <text x="174" y="316" fill="#6E2C2C" fontSize="11" fontFamily="monospace" letterSpacing="2">PRESS A DIGIT</text>
                <g fill="#D46C49" stroke="#1C1916" strokeWidth="2">
                  <rect x="174" y="335" width="29" height="24" />
                  <rect x="212" y="335" width="29" height="24" />
                  <rect x="250" y="335" width="29" height="24" />
                  <rect x="174" y="368" width="29" height="24" />
                  <rect x="212" y="368" width="29" height="24" />
                  <rect x="250" y="368" width="29" height="24" />
                  <rect x="174" y="401" width="29" height="24" />
                  <rect x="212" y="401" width="29" height="24" />
                  <rect x="250" y="401" width="29" height="24" />
                  <rect x="174" y="434" width="29" height="24" />
                  <rect x="212" y="434" width="29" height="24" />
                  <rect x="250" y="434" width="29" height="24" />
                </g>
                <g fill="#F8F3E9" fontSize="13" fontWeight="700" fontFamily="monospace" textAnchor="middle">
                  <text x="188" y="352">1</text><text x="226" y="352">2</text><text x="264" y="352">3</text>
                  <text x="188" y="385">4</text><text x="226" y="385">5</text><text x="264" y="385">6</text>
                  <text x="188" y="418">7</text><text x="226" y="418">8</text><text x="264" y="418">9</text>
                  <text x="188" y="451">*</text><text x="226" y="451">0</text><text x="264" y="451">#</text>
                </g>
                <text x="307" y="316" fill="#6E2C2C" fontSize="11" fontFamily="monospace" letterSpacing="2">OPENINGS</text>
                <rect x="307" y="335" width="119" height="57" fill="#FAF7F1" stroke="#1C1916" strokeWidth="3" />
                <text x="320" y="357" fill="#D46C49" fontSize="12" fontWeight="700" fontFamily="monospace">01</text>
                <path d="M348 353H411M348 370H390" stroke="#1C1916" strokeWidth="5" strokeLinecap="square" />
                <rect x="307" y="401" width="119" height="57" fill="#D46C49" stroke="#1C1916" strokeWidth="3" />
                <text x="320" y="423" fill="#F8F3E9" fontSize="12" fontWeight="700" fontFamily="monospace">02</text>
                <path d="M348 419H411M348 436H390" stroke="#F8F3E9" strokeWidth="5" strokeLinecap="square" />
              </g>
              <g transform="translate(45 575)">
                <path d="M0 0H220" stroke="#1C1916" strokeWidth="2" />
                <text y="27" fill="#1C1916" fontSize="12" fontFamily="monospace" letterSpacing="2">01  /  BOOKED GROOM</text>
              </g>
            </svg>
            <div className="absolute left-6 top-6 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink/70 sm:left-8 sm:top-8">
              01 / missed call to booking
            </div>
            <div className="studio-booked-badge">
              <span className="studio-booked-check" aria-hidden="true">✓</span>
              <span>
                <strong>Appointment booked</strong>
                <small>Confirmation text sent</small>
              </span>
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-[1280px] gap-5 px-6 py-8 sm:grid-cols-3 sm:px-10 lg:px-12">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Made for independent groomers</p>
            <p className="text-sm leading-[1.55] text-muted">No app for pet parents. No new front desk for you. Just a fast booking experience connected to the tools your shop already uses.</p>
            <p className="text-sm leading-[1.55] text-muted sm:border-l sm:border-line sm:pl-6">Works with Google Calendar and Square, so RingPaw only offers times that are actually open.</p>
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-6 py-20 sm:px-10 sm:py-28 lg:px-12">
          <div className="grid items-center gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
            <div>
              <p className="studio-eyebrow mb-5"><span className="studio-eyebrow-line" />What callers hear</p>
              <h2 className="max-w-[500px] text-4xl font-bold leading-[0.95] tracking-[-0.055em] sm:text-6xl">
                A booking conversation. <span className="text-accent">Not a dead end.</span>
              </h2>
              <p className="mt-6 max-w-[430px] text-[16px] leading-[1.65] text-muted">
                RingPaw sounds like your shop, checks the calendar while the caller is still on the phone, and turns intent into an appointment.
              </p>
              <Link href="/demo" className="studio-text-link mt-7">
                Hear the full call <ArrowIcon className="h-4 w-4" />
              </Link>
            </div>

            <div className="studio-conversation" aria-label="Example RingPaw booking conversation">
              <div className="studio-conversation-topline">
                <span>Example missed call</span>
                <span className="studio-live-dot">RingPaw answering</span>
              </div>
              <div className="grid gap-5 p-5 sm:p-7 lg:grid-cols-[1fr_0.82fr]">
                <div className="flex flex-col gap-4">
                  <div className="studio-bubble studio-bubble-caller">
                    <span>Caller</span>
                    <p>“Do you have anything Thursday morning for Luna?”</p>
                  </div>
                  <div className="studio-bubble studio-bubble-ringpaw">
                    <span>RingPaw</span>
                    <p>“I have 9:30 or 11:00 for a full groom. Which works better?”</p>
                  </div>
                  <div className="studio-bubble studio-bubble-caller studio-bubble-short">
                    <span>Caller</span>
                    <p>“Let’s do 11.”</p>
                  </div>
                </div>

                <div className="studio-appointment-card">
                  <div className="flex items-center justify-between border-b border-line pb-4">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">New appointment</span>
                    <span className="studio-confirmed-pill">Booked</span>
                  </div>
                  <div className="py-5">
                    <p className="text-2xl font-bold tracking-[-0.04em]">Luna</p>
                    <p className="mt-1 text-sm text-muted">Golden retriever · Full groom</p>
                  </div>
                  <dl className="grid grid-cols-2 gap-4 border-y border-line py-4 text-sm">
                    <div>
                      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">When</dt>
                      <dd className="mt-1 font-semibold">Thu · 11:00 AM</dd>
                    </div>
                    <div>
                      <dt className="font-mono text-[9px] uppercase tracking-[0.14em] text-muted">Service</dt>
                      <dd className="mt-1 font-semibold">Full groom</dd>
                    </div>
                  </dl>
                  <p className="mt-4 flex items-center gap-2 text-xs font-semibold text-ink">
                    <span className="studio-mini-check" aria-hidden="true">✓</span> Confirmation sent to caller
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-[1280px] px-6 py-20 sm:px-10 sm:py-28 lg:px-12">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <p className="studio-eyebrow mb-5"><span className="studio-eyebrow-line" />How it works</p>
              <h2 className="max-w-[420px] text-4xl font-bold leading-[0.95] tracking-[-0.055em] sm:text-6xl">
                Missed call in.<br /><span className="text-accent">Booked groom out.</span>
              </h2>
              <p className="mt-6 max-w-[320px] text-[15px] leading-[1.6] text-muted">
                RingPaw keeps the caller moving while you keep grooming. Every step is short, clear, and tied to your real availability.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <article className="studio-process-card">
                <span className="studio-number">01</span>
                <div className="studio-symbol"><PhoneSymbol /></div>
                <h3>Missed call</h3>
                <p>You&apos;re bathing, drying, or clipping. Your shop number forwards only the call you couldn&apos;t answer.</p>
              </article>
              <article className="studio-process-card studio-process-card-dark">
                <span className="studio-number">02</span>
                <div className="studio-symbol"><KeypadSymbol /></div>
                <h3>RingPaw responds</h3>
                <p>Pet parents hear your shop name, choose a grooming service, and get real openings without waiting for a callback.</p>
              </article>
              <article className="studio-process-card">
                <span className="studio-number">03</span>
                <div className="studio-symbol"><CalendarSymbol /></div>
                <h3>Customer books</h3>
                <p>They pick an open time. RingPaw writes the grooming appointment to Google Calendar or Square.</p>
              </article>
              <article className="studio-process-card studio-process-card-confirmed">
                <span className="studio-number">04</span>
                <div className="studio-symbol studio-symbol-check" aria-hidden="true">✓</div>
                <h3>Another appointment</h3>
                <p>The customer gets a confirmation text. You get the booking — without putting down the clippers.</p>
              </article>
            </div>
          </div>
        </section>

        <section id="why-ringpaw" className="bg-accent text-paper">
          <div className="mx-auto grid max-w-[1280px] gap-12 px-6 py-20 sm:px-10 sm:py-28 lg:grid-cols-[1fr_1fr] lg:items-end lg:px-12">
            <div>
              <p className="studio-eyebrow studio-eyebrow-light mb-6"><span className="studio-eyebrow-line" />The RingPaw promise</p>
              <h2 className="max-w-[620px] text-4xl font-bold leading-[0.93] tracking-[-0.06em] sm:text-6xl">
                Stop letting missed calls<br /><span className="text-sun">become missed grooms.</span>
              </h2>
            </div>
            <div className="lg:justify-self-end">
              <p className="max-w-[390px] text-[18px] leading-[1.55] text-paper/70">
                A single recovered grooming appointment can cover the month. RingPaw helps your phone keep booking even when your hands are full.
              </p>
              <ul className="mt-7 grid max-w-[420px] gap-3 text-sm font-semibold text-paper/90">
                <li className="studio-promise-item"><span>✓</span> Keep the shop number customers already know</li>
                <li className="studio-promise-item"><span>✓</span> Offer only openings from your real calendar</li>
                <li className="studio-promise-item"><span>✓</span> Send the customer a confirmation automatically</li>
              </ul>
              <Link href="/onboarding" className="studio-button studio-button-sun mt-8">
                Start booking missed calls <ArrowIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section id="price" className="mx-auto max-w-[1280px] px-6 py-20 sm:px-10 sm:py-28 lg:px-12">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="studio-eyebrow mb-5"><span className="studio-eyebrow-line" />One simple plan</p>
              <h2 className="text-4xl font-bold leading-[0.95] tracking-[-0.055em] sm:text-6xl">One missed groom costs more.<br /><span className="text-accent">RingPaw costs $79.</span></h2>
            </div>
            <div className="studio-price-card">
              <div>
                <p className="text-[clamp(4.5rem,10vw,8rem)] font-bold leading-[0.8] tracking-[-0.08em]">$79</p>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">per month / one shop / one number</p>
              </div>
              <div className="max-w-[320px]">
                <ul className="grid gap-3 text-sm text-ink">
                  <li className="studio-price-feature"><span>✓</span> Missed-call answering</li>
                  <li className="studio-price-feature"><span>✓</span> Google Calendar or Square booking</li>
                  <li className="studio-price-feature"><span>✓</span> Customer confirmation texts</li>
                  <li className="studio-price-feature"><span>✓</span> Keep your existing shop number</li>
                </ul>
                <Link href="/onboarding" className="studio-button mt-7">Set up RingPaw <ArrowIcon className="h-4 w-4" /></Link>
                <p className="mt-3 text-xs text-muted">Cancel any time.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-[1280px] gap-12 px-6 py-20 sm:px-10 sm:py-28 lg:grid-cols-[0.7fr_1.3fr] lg:px-12">
            <div>
              <p className="studio-eyebrow mb-5"><span className="studio-eyebrow-line" />Good to know</p>
              <h2 className="max-w-[390px] text-4xl font-bold leading-[0.95] tracking-[-0.055em] sm:text-5xl">
                Built to fit your shop. <span className="text-accent">Not replace it.</span>
              </h2>
            </div>
            <div className="divide-y divide-line border-y border-line">
              <FaqItem question="Do I need a new phone number?">
                No. Keep the shop number your customers already use. You forward the calls you miss to RingPaw.
              </FaqItem>
              <FaqItem question="Can RingPaw double-book me?">
                RingPaw offers openings from your connected Google Calendar or Square schedule and writes the confirmed appointment back to it.
              </FaqItem>
              <FaqItem question="What does the customer receive?">
                The caller books on the phone and receives a confirmation text with the appointment details.
              </FaqItem>
              <FaqItem question="Is RingPaw made for any kind of business?">
                No. RingPaw is intentionally built around grooming services, pet details, appointment lengths, and the way independent groomers work.
              </FaqItem>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-6 py-20 sm:px-10 sm:py-28 lg:px-12">
          <div className="studio-final-cta">
            <p className="studio-eyebrow studio-eyebrow-light mb-5"><span className="studio-eyebrow-line" />Your next missed call</p>
            <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
              <h2 className="max-w-[760px] text-4xl font-bold leading-[0.93] tracking-[-0.06em] text-paper sm:text-6xl">
                You keep grooming. <span className="text-sun">RingPaw keeps booking.</span>
              </h2>
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
                <Link href="/onboarding" className="studio-button studio-button-sun">
                  Set up my shop <ArrowIcon className="h-4 w-4" />
                </Link>
                <Link href="/demo" className="studio-final-link">
                  Hear RingPaw first <ArrowIcon className="h-4 w-4" />
                </Link>
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
            <span>© {new Date().getFullYear()} RingPaw</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FaqItem({ question, children }: { question: string; children: ReactNode }) {
  return (
    <details className="studio-faq group">
      <summary>
        <span>{question}</span>
        <span className="studio-faq-plus" aria-hidden="true">+</span>
      </summary>
      <p>{children}</p>
    </details>
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
