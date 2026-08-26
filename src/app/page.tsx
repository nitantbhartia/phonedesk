"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { ArrowIcon } from "@/components/arrow-icon";
import { RINGPAW_ESTIMATED_CALLS, RINGPAW_PLAN_MINUTES, RINGPAW_PLAN_PRICE } from "@/lib/billing-plans";

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
  const [missedCallsPerDay, setMissedCallsPerDay] = useState(3);
  const [averageGroomValue, setAverageGroomValue] = useState(85);

  const monthlyMissedCalls = missedCallsPerDay * 26;
  const recoveredAppointments = Math.round(monthlyMissedCalls * 0.35);
  const recoverableRevenue = recoveredAppointments * averageGroomValue;

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
            <a href="#calculator" className="studio-link">Calculator</a>
            <a href="#price" className="studio-link">Price</a>
          </div>
          <div className="flex items-center gap-5">
            <Link href="/login?mode=signin" className="hidden text-[12px] font-semibold text-muted hover:text-ink sm:inline">
              Log in
            </Link>
            <Link href="/demo" className="studio-button studio-button-small">
              See it work <ArrowIcon className="h-4 w-4" />
            </Link>
          </div>
        </nav>
      </header>

      <main>
        <section className="mx-auto grid max-w-[1280px] gap-12 px-6 pb-16 pt-12 sm:px-10 sm:pb-24 sm:pt-20 lg:grid-cols-[0.88fr_1.12fr] lg:items-center lg:gap-16 lg:px-12 lg:pt-24">
          <div>
            <p className="studio-eyebrow mb-7">
              <span className="studio-eyebrow-line" />
              Built for pet groomers <span>/</span> busy hands <span>/</span> booked grooms
            </p>
            <h1 className="max-w-[680px] text-[clamp(3.1rem,5.3vw,5.5rem)] font-bold leading-[0.9] tracking-[-0.068em]">
              Busy grooming dogs? <span className="text-accent">Don&apos;t lose the groom while your hands are full.</span>
            </h1>
            <p className="mt-8 max-w-[490px] text-[17px] leading-[1.55] text-muted sm:text-[18px]">
              RingPaw responds when you can&apos;t, offers real openings from your calendar, books the appointment, and sends the confirmation — while you stay with the dog on your table.
            </p>
            <div className="mt-9 flex flex-col items-start gap-5 sm:flex-row sm:items-center">
              <Link href="/demo" className="studio-button">
                See RingPaw recover a booking <ArrowIcon className="h-4 w-4" />
              </Link>
              <Link href="/onboarding" className="studio-text-link">
                Set up my shop <ArrowIcon className="h-4 w-4" />
              </Link>
            </div>
            <div className="mt-14 grid max-w-[560px] grid-cols-3 border-t border-line pt-5">
              <div>
                <p className="studio-fact-label">${RINGPAW_PLAN_PRICE}/mo</p>
                <p className="studio-fact-detail">{RINGPAW_PLAN_MINUTES} min included</p>
              </div>
              <div className="border-l border-line pl-4 sm:pl-6">
                <p className="studio-fact-label">keep your number</p>
                <p className="studio-fact-detail">responds when you can&apos;t</p>
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
              <desc id="ringpaw-illustration-desc">A live voice call connects a pet parent to RingPaw, which finds an opening and books a grooming appointment.</desc>
              <defs>
                <pattern id="diagonal-grid" width="28" height="28" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
                  <path d="M0 0V28" stroke="#D8D0C4" strokeOpacity=".55" />
                </pattern>
              </defs>
              <rect width="700" height="620" fill="#F3EEE4" />
              <rect width="700" height="620" fill="url(#diagonal-grid)" />
              <path d="M363 340C405 316 421 316 450 316" stroke="#D46C49" strokeWidth="5" strokeLinecap="round" strokeDasharray="2 15" />
              <g transform="translate(535 120)">
                <circle r="104" fill="#FAF7F1" />
                <circle r="126" fill="none" stroke="#D8D0C4" strokeOpacity=".8" strokeWidth="12" />
                <path d="M-30-10c8-22 22-34 38-38l18 24-18 16c8 18 21 31 39 39l16-18 24 18c-4 17-16 29-38 36-36-8-68-39-79-77Z" fill="#D46C49" stroke="#1C1916" strokeWidth="5" strokeLinejoin="round" />
                <path d="M-72-47c-11 11-17 24-18 39M-54-67c-18 18-28 38-30 59M74-47c11 11 17 24 18 39M56-67c18 18 28 38 30 59" stroke="#1C1916" strokeWidth="4" strokeLinecap="round" />
                <text x="-55" y="146" fill="#1C1916" fontSize="11" fontWeight="700" fontFamily="monospace" letterSpacing="2">VOICE LINE</text>
              </g>
              <g transform="translate(80 126)">
                <rect width="310" height="400" rx="28" fill="#F8F3E9" stroke="#1C1916" strokeWidth="8" />
                <rect x="17" y="17" width="276" height="56" rx="17" fill="#1C1916" />
                <circle cx="47" cy="45" r="12" fill="#F1B248" />
                <path d="M42 45h10M47 40v10" stroke="#1C1916" strokeWidth="2.5" strokeLinecap="round" />
                <text x="73" y="50" fill="#F8F3E9" fontSize="11" fontWeight="700" fontFamily="monospace" letterSpacing="2">RINGPAW LINE</text>
                <text x="28" y="122" fill="#6E2C2C" fontSize="11" fontWeight="700" fontFamily="monospace" letterSpacing="2">INCOMING CALL</text>
                <text x="28" y="154" fill="#1C1916" fontSize="25" fontWeight="700" fontFamily="Georgia, serif">Paws &amp; Polish</text>
                <circle cx="155" cy="224" r="54" fill="#D46C49" />
                <path d="M135 210c5-13 13-20 22-22l11 15-11 10c5 11 13 19 24 24l10-11 15 11c-3 11-10 18-23 22-24-6-43-27-48-49Z" fill="#F8F3E9" stroke="#1C1916" strokeWidth="4" strokeLinejoin="round" />
                <g transform="translate(28 300)" fill="#D46C49">
                  <rect x="0" y="20" width="8" height="24" rx="4" /><rect x="14" y="7" width="8" height="50" rx="4" /><rect x="28" y="0" width="8" height="64" rx="4" /><rect x="42" y="12" width="8" height="40" rx="4" /><rect x="56" y="4" width="8" height="56" rx="4" /><rect x="70" y="17" width="8" height="30" rx="4" /><rect x="84" y="8" width="8" height="48" rx="4" /><rect x="98" y="22" width="8" height="20" rx="4" />
                </g>
                <text x="214" y="338" fill="#1C1916" fontSize="12" fontWeight="700" fontFamily="monospace">00:42</text>
                <circle cx="226" cy="418" r="22" fill="#D8D0C4" /><circle cx="268" cy="418" r="22" fill="#6E2C2C" />
                <path d="M217 418h18M259 410l18 16M277 410l-18 16" stroke="#1C1916" strokeWidth="3" strokeLinecap="round" />
              </g>
              <g transform="translate(422 258)">
                <rect width="220" height="190" rx="20" fill="#FAF7F1" stroke="#1C1916" strokeWidth="4" />
                <text x="20" y="34" fill="#6E2C2C" fontSize="10" fontWeight="700" fontFamily="monospace" letterSpacing="1.6">OPENING FOUND</text>
                <text x="20" y="76" fill="#1C1916" fontSize="22" fontWeight="700" fontFamily="Georgia, serif">Thu · 11:00 AM</text>
                <text x="20" y="104" fill="#5F564D" fontSize="11" fontFamily="monospace" letterSpacing="1.5">FULL GROOM · LUNA</text>
                <circle cx="34" cy="151" r="14" fill="#D46C49" /><path d="m28 151 4 4 8-9" stroke="#FAF7F1" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
                <text x="58" y="156" fill="#1C1916" fontSize="11" fontWeight="700" fontFamily="monospace" letterSpacing="1.5">BOOKED</text>
              </g>
              <g transform="translate(45 575)">
                <path d="M0 0H220" stroke="#1C1916" strokeWidth="2" />
                <text y="27" fill="#1C1916" fontSize="12" fontFamily="monospace" letterSpacing="2">01  /  VOICE TO BOOKING</text>
              </g>
            </svg>
            <div className="absolute left-6 top-6 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-ink/70 sm:left-8 sm:top-8">
              01 / voice inquiry to booking
            </div>
            <div className="studio-booked-badge">
              <span className="studio-booked-check" aria-hidden="true">✓</span>
              <span>
                <strong>Call answered</strong>
                <small>Grooming appointment booked</small>
              </span>
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-[1280px] gap-5 px-6 py-8 sm:grid-cols-3 sm:px-10 lg:px-12">
            <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Made for independent groomers</p>
            <p className="text-sm leading-[1.55] text-muted">No app for pet parents. No new front desk for you. Just a natural voice booking experience connected to the tools your shop already uses.</p>
            <p className="text-sm leading-[1.55] text-muted sm:border-l sm:border-line sm:pl-6">Works with Google Calendar and Square today, with calendar sync paths for MoeGo and Gingr.</p>
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-6 py-20 sm:px-10 sm:py-28 lg:px-12">
          <div className="grid items-center gap-12 lg:grid-cols-[0.78fr_1.22fr] lg:gap-20">
            <div>
              <p className="studio-eyebrow mb-5"><span className="studio-eyebrow-line" />What happens after you miss one</p>
              <h2 className="max-w-[500px] text-4xl font-bold leading-[0.95] tracking-[-0.055em] sm:text-6xl">
                A booking conversation. <span className="text-accent">Not a dead end.</span>
              </h2>
              <p className="mt-6 max-w-[430px] text-[16px] leading-[1.65] text-muted">
                RingPaw responds like your shop, checks the calendar while the pet parent is still there, and turns intent into an appointment.
              </p>
              <Link href="/demo" className="studio-text-link mt-7">
                See the booking experience <ArrowIcon className="h-4 w-4" />
              </Link>
            </div>

            <div className="studio-conversation" aria-label="Example RingPaw booking conversation">
              <div className="studio-conversation-topline">
                <span>Example missed inquiry</span>
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

        <section id="calculator" className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-[1280px] gap-12 px-6 py-20 sm:px-10 sm:py-28 lg:grid-cols-[0.8fr_1.2fr] lg:items-center lg:px-12">
            <div>
              <p className="studio-eyebrow mb-5"><span className="studio-eyebrow-line" />The missed-booking math</p>
              <h2 className="max-w-[470px] text-4xl font-bold leading-[0.95] tracking-[-0.055em] sm:text-6xl">
                See what your <span className="text-accent">quiet phone</span> may be costing.
              </h2>
              <p className="mt-6 max-w-[400px] text-[16px] leading-[1.65] text-muted">
                A quick planning estimate for independent groomers. Adjust the numbers to match your shop.
              </p>
            </div>

            <div className="studio-calculator">
              <div className="studio-calculator-controls">
                <label>
                  <span>Unanswered inquiries on a busy day</span>
                  <strong>{missedCallsPerDay}</strong>
                  <input
                    type="range"
                    min="1"
                    max="12"
                    step="1"
                    value={missedCallsPerDay}
                    onChange={(event) => setMissedCallsPerDay(Number(event.target.value))}
                    aria-label="Unanswered inquiries on a busy day"
                  />
                </label>
                <label>
                  <span>Average groom value</span>
                  <strong>${averageGroomValue}</strong>
                  <input
                    type="range"
                    min="45"
                    max="150"
                    step="5"
                    value={averageGroomValue}
                    onChange={(event) => setAverageGroomValue(Number(event.target.value))}
                    aria-label="Average groom value"
                  />
                </label>
              </div>
              <div className="studio-calculator-result">
                <p className="studio-calculator-kicker">Planning estimate / 26 working days</p>
                <p className="studio-calculator-value">${recoverableRevenue.toLocaleString()}</p>
                <p className="studio-calculator-caption">potential monthly revenue from {recoveredAppointments} recovered bookings</p>
                <p className="studio-calculator-note">Based on a conservative 35% recovery estimate. Your results will vary.</p>
              </div>
            </div>
          </div>
        </section>

        <section id="how-it-works" className="mx-auto max-w-[1280px] px-6 py-20 sm:px-10 sm:py-28 lg:px-12">
          <div className="grid gap-10 lg:grid-cols-[0.72fr_1.28fr]">
            <div>
              <p className="studio-eyebrow mb-5"><span className="studio-eyebrow-line" />How it works</p>
              <h2 className="max-w-[420px] text-4xl font-bold leading-[0.95] tracking-[-0.055em] sm:text-6xl">
                Missed inquiry in.<br /><span className="text-accent">Booked groom out.</span>
              </h2>
              <p className="mt-6 max-w-[320px] text-[15px] leading-[1.6] text-muted">
                RingPaw keeps the pet parent moving while you keep grooming. Every step is short, clear, and tied to your real availability.
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <article className="studio-process-card">
                <span className="studio-number">01</span>
                <div className="studio-symbol"><PhoneSymbol /></div>
                <h3>You&apos;re busy</h3>
                <p>You&apos;re bathing, drying, or clipping. RingPaw catches the shop inquiry you couldn&apos;t answer.</p>
              </article>
              <article className="studio-process-card studio-process-card-dark">
                <span className="studio-number">02</span>
                <div className="studio-symbol"><KeypadSymbol /></div>
                <h3>RingPaw responds</h3>
                <p>The pet parent gets a helpful response, chooses a grooming service, and sees real openings without waiting for a callback.</p>
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

        <section className="mx-auto max-w-[1280px] px-6 pb-20 sm:px-10 sm:pb-28 lg:px-12">
          <div className="studio-setup-path">
            <div className="grid gap-8 lg:grid-cols-[0.7fr_1.3fr] lg:items-end">
              <div>
                <p className="studio-eyebrow mb-5"><span className="studio-eyebrow-line" />Five minutes to live</p>
                <h2 className="max-w-[420px] text-4xl font-bold leading-[0.95] tracking-[-0.055em] sm:text-5xl">
                  Setup that fits between <span className="text-accent">two grooms.</span>
                </h2>
              </div>
              <p className="max-w-[430px] text-[16px] leading-[1.65] text-muted lg:justify-self-end">
                Connect the tools your shop already uses, test one booking, and let RingPaw handle the next inquiry you miss.
              </p>
            </div>
            <ol className="studio-setup-steps">
              <li><span>01</span><strong>Shop details</strong><small>Use the name customers know.</small></li>
              <li><span>02</span><strong>Calendar</strong><small>Connect Google Calendar, Square, or a synced MoeGo/Gingr calendar.</small></li>
              <li><span>03</span><strong>Services</strong><small>Add your most-booked grooms.</small></li>
              <li><span>04</span><strong>Catch inquiries</strong><small>Keep your existing number.</small></li>
              <li><span>05</span><strong>Test booking</strong><small>Hear the flow before going live.</small></li>
            </ol>
          </div>
        </section>

        <section id="why-ringpaw" className="bg-accent text-paper">
          <div className="mx-auto grid max-w-[1280px] gap-12 px-6 py-20 sm:px-10 sm:py-28 lg:grid-cols-[1fr_1fr] lg:items-end lg:px-12">
            <div>
              <p className="studio-eyebrow studio-eyebrow-light mb-6"><span className="studio-eyebrow-line" />The RingPaw promise</p>
              <h2 className="max-w-[620px] text-4xl font-bold leading-[0.93] tracking-[-0.06em] sm:text-6xl">
                Stop letting busy moments<br /><span className="text-sun">become missed grooms.</span>
              </h2>
            </div>
            <div className="lg:justify-self-end">
              <p className="max-w-[390px] text-[18px] leading-[1.55] text-paper/85">
                A single recovered grooming appointment can cover the month. RingPaw keeps your shop responsive even when your hands are full.
              </p>
              <ul className="mt-7 grid max-w-[420px] gap-3 text-sm font-semibold text-paper/90">
                <li className="studio-promise-item"><span>✓</span> Keep the shop number customers already know</li>
                <li className="studio-promise-item"><span>✓</span> Offer only openings from your real calendar</li>
                <li className="studio-promise-item"><span>✓</span> Send the customer a confirmation automatically</li>
              </ul>
              <Link href="/onboarding" className="studio-button studio-button-sun mt-8">
                Start recovering bookings <ArrowIcon className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </section>

        <section id="price" className="mx-auto max-w-[1280px] px-6 py-20 sm:px-10 sm:py-28 lg:px-12">
          <div className="grid gap-12 lg:grid-cols-[0.9fr_1.1fr] lg:items-end">
            <div>
              <p className="studio-eyebrow mb-5"><span className="studio-eyebrow-line" />One simple plan</p>
              <h2 className="text-4xl font-bold leading-[0.95] tracking-[-0.055em] sm:text-6xl">One missed groom costs more.<br /><span className="text-accent">RingPaw costs ${RINGPAW_PLAN_PRICE}.</span></h2>
            </div>
            <div className="studio-price-card">
              <div>
                <p className="text-[clamp(4.5rem,10vw,8rem)] font-bold leading-[0.8] tracking-[-0.08em]">${RINGPAW_PLAN_PRICE}</p>
                <p className="mt-4 font-mono text-[10px] uppercase tracking-[0.18em] text-muted">per month / one shop / one number</p>
              </div>
              <div className="max-w-[320px]">
                <ul className="grid gap-3 text-sm text-ink">
                  <li className="studio-price-feature"><span>✓</span> Missed-inquiry recovery</li>
                  <li className="studio-price-feature"><span>✓</span> Google Calendar or Square booking</li>
                  <li className="studio-price-feature"><span>✓</span> Customer confirmation texts</li>
                  <li className="studio-price-feature"><span>✓</span> Keep your existing shop number</li>
                  <li className="studio-price-feature"><span>✓</span> {RINGPAW_PLAN_MINUTES} minutes / month (~{RINGPAW_ESTIMATED_CALLS} two-minute calls)</li>
                </ul>
                <Link href="/onboarding" className="studio-button mt-7">Set up RingPaw <ArrowIcon className="h-4 w-4" /></Link>
                <p className="mt-3 text-xs text-muted">Cancel any time.</p>
              </div>
            </div>
          </div>
        </section>

        <section className="border-y border-line bg-surface">
          <div className="mx-auto grid max-w-[1280px] gap-10 px-6 py-20 sm:px-10 sm:py-28 lg:grid-cols-[0.7fr_1.3fr] lg:items-center lg:px-12">
            <div>
              <p className="studio-eyebrow mb-5"><span className="studio-eyebrow-line" />Plays nice with your stack</p>
              <h2 className="max-w-[390px] text-4xl font-bold leading-[0.95] tracking-[-0.055em] sm:text-5xl">
                Your calendar stays the <span className="text-accent">source of truth.</span>
              </h2>
              <p className="mt-6 max-w-[370px] text-[15px] leading-[1.6] text-muted">
                RingPaw checks what is actually open before offering a time, then writes the confirmed grooming appointment back where your team already works. Native connections are available for Google Calendar and Square; MoeGo and Gingr work through their calendar sync.
              </p>
            </div>
            <div className="studio-integration-grid">
              <article className="studio-integration-card">
                <div className="studio-integration-mark studio-integration-mark-google">G</div>
                <div>
                  <h3>Google Calendar</h3>
                  <p>Real openings in, confirmed grooms out. No double-booking surprises.</p>
                </div>
              </article>
              <article className="studio-integration-card">
                <div className="studio-integration-mark studio-integration-mark-square">□</div>
                <div>
                  <h3>Square</h3>
                  <p>Keep your services and schedule connected to the system you already use.</p>
                </div>
              </article>
              <article className="studio-integration-card">
                <div className="studio-integration-mark studio-integration-mark-moego">M</div>
                <div>
                  <h3>MoeGo</h3>
                  <p>Keep MoeGo as your source of truth through its Google Calendar sync.</p>
                </div>
              </article>
              <article className="studio-integration-card">
                <div className="studio-integration-mark studio-integration-mark-gingr">g</div>
                <div>
                  <h3>Gingr</h3>
                  <p>Bring your Gingr availability over through the calendar your shop already syncs.</p>
                </div>
              </article>
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
                No. Keep the shop number your customers already use. RingPaw only steps in when you can&apos;t answer.
              </FaqItem>
              <FaqItem question="Can RingPaw double-book me?">
                RingPaw offers openings from your connected Google Calendar or Square schedule and writes the confirmed appointment back to it. If you use MoeGo or Gingr, keep your existing calendar sync in place.
              </FaqItem>
              <FaqItem question="What does the customer receive?">
                The pet parent chooses an opening and receives a confirmation text with the appointment details.
              </FaqItem>
              <FaqItem question="Does RingPaw make outbound calls?">
                No. RingPaw is a missed-inquiry safety net, not an outbound calling or sales tool. It responds only when a customer reaches your shop and you can&apos;t answer.
              </FaqItem>
              <FaqItem question="Is RingPaw made for any kind of business?">
                No. RingPaw is intentionally built around grooming services, pet details, appointment lengths, and the way independent groomers work.
              </FaqItem>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-[1280px] px-6 py-20 sm:px-10 sm:py-28 lg:px-12">
          <div className="studio-final-cta">
            <p className="studio-eyebrow studio-eyebrow-light mb-5"><span className="studio-eyebrow-line" />Your next missed inquiry</p>
            <div className="grid items-end gap-8 lg:grid-cols-[1fr_auto]">
              <h2 className="max-w-[760px] text-4xl font-bold leading-[0.93] tracking-[-0.06em] text-paper sm:text-6xl">
                You keep grooming. <span className="text-sun">RingPaw keeps booking.</span>
              </h2>
              <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center lg:flex-col lg:items-stretch">
                <Link href="/onboarding" className="studio-button studio-button-sun">
                  Set up my shop <ArrowIcon className="h-4 w-4" />
                </Link>
                <Link href="/demo" className="studio-final-link">
                  See RingPaw first <ArrowIcon className="h-4 w-4" />
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
