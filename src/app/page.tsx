"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import { DemoCallPlayer } from "@/components/demo-call-player";

export default function LandingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-paw-sky">
        <div className="animate-pulse text-paw-brown/60">Loading...</div>
      </div>
    }>
      <LandingPageContent />
    </Suspense>
  );
}

function LandingPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [isResolvingRedirect, setIsResolvingRedirect] = useState(false);
  const [missedPerDay, setMissedPerDay] = useState(6);
  const [groomPrice, setGroomPrice] = useState(85);
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
      <div className="min-h-screen flex items-center justify-center bg-paw-sky">
        <div className="animate-pulse text-paw-brown/60">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-paw-sky text-paw-brown selection:bg-paw-amber selection:text-paw-brown">
      {/* Background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <svg
          className="paw-shape absolute top-[-10%] left-[-5%] w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] text-paw-amber"
          viewBox="0 0 200 200"
          fill="currentColor"
        >
          <ellipse cx="100" cy="130" rx="38" ry="32" />
          <ellipse cx="62" cy="82" rx="16" ry="20" transform="rotate(-10 62 82)" />
          <ellipse cx="138" cy="82" rx="16" ry="20" transform="rotate(10 138 82)" />
          <ellipse cx="82" cy="62" rx="14" ry="18" transform="rotate(-5 82 62)" />
          <ellipse cx="118" cy="62" rx="14" ry="18" transform="rotate(5 118 62)" />
        </svg>
        <svg
          className="paw-shape absolute bottom-[-10%] right-[-5%] w-[300px] sm:w-[600px] h-[300px] sm:h-[600px] text-white opacity-60"
          viewBox="0 0 200 200"
          fill="currentColor"
        >
          <ellipse cx="100" cy="130" rx="38" ry="32" />
          <ellipse cx="62" cy="82" rx="16" ry="20" transform="rotate(-10 62 82)" />
          <ellipse cx="138" cy="82" rx="16" ry="20" transform="rotate(10 138 82)" />
          <ellipse cx="82" cy="62" rx="14" ry="18" transform="rotate(-5 82 62)" />
          <ellipse cx="118" cy="62" rx="14" ry="18" transform="rotate(5 118 62)" />
        </svg>
      </div>

      {/* Nav */}
      <div className="sticky top-0 z-50 flex justify-center pt-3 sm:pt-4 px-4">
        <div className="w-full max-w-5xl">
          <nav className="w-full px-4 sm:px-6 py-3 flex justify-between items-center glass-card rounded-full shadow-soft">
            <BrandLogo
              priority
              mobileWidth={156}
              desktopWidth={236}
              className="min-w-0 max-w-[156px] sm:max-w-[236px]"
            />
            <div className="hidden md:flex gap-8 font-medium text-paw-brown/80">
              <a href="#how-it-works" className="nav-link-hover hover:text-paw-brown transition-colors">How it Works</a>
              <a href="#features" className="nav-link-hover hover:text-paw-brown transition-colors">Features</a>
              <a href="#pricing" className="nav-link-hover hover:text-paw-brown transition-colors">Pricing</a>
            </div>
            <div className="flex items-center gap-2">
              <Link
                href="/demo"
                className="hidden sm:block px-5 py-2.5 sm:px-6 sm:py-3 bg-paw-brown text-paw-cream rounded-full font-semibold text-sm sm:text-base hover:bg-opacity-90 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50"
              >
                Try the Demo
              </Link>
              {/* Mobile hamburger */}
              <button
                className="md:hidden p-2 rounded-full hover:bg-paw-brown/10 transition-colors"
                onClick={() => setMobileMenuOpen((v) => !v)}
                aria-label="Toggle menu"
              >
                {mobileMenuOpen ? (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 6 6 18" /><path d="m6 6 12 12" />
                  </svg>
                ) : (
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="4" x2="20" y1="6" y2="6" /><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="20" y1="18" y2="18" />
                  </svg>
                )}
              </button>
            </div>
          </nav>
          {/* Mobile dropdown */}
          {mobileMenuOpen && (
            <div className="md:hidden mt-2 glass-card rounded-3xl shadow-soft px-6 py-4 flex flex-col gap-4">
              <a href="#how-it-works" onClick={() => setMobileMenuOpen(false)} className="font-semibold text-paw-brown/80 hover:text-paw-brown transition-colors py-1">How it Works</a>
              <a href="#features" onClick={() => setMobileMenuOpen(false)} className="font-semibold text-paw-brown/80 hover:text-paw-brown transition-colors py-1">Features</a>
              <a href="#pricing" onClick={() => setMobileMenuOpen(false)} className="font-semibold text-paw-brown/80 hover:text-paw-brown transition-colors py-1">Pricing</a>
              <Link
                href="/demo"
                onClick={() => setMobileMenuOpen(false)}
                className="mt-1 px-6 py-3 bg-paw-brown text-paw-cream rounded-full font-bold text-center hover:bg-opacity-90 transition-all shadow-lg"
              >
                Try the Demo
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* Hero */}
      <header className="relative z-10 pt-8 sm:pt-12 pb-12 sm:pb-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-8 sm:gap-12 lg:gap-16 items-center">
          {/* Left column */}
          <div className="space-y-6 sm:space-y-8">
            <div className="animate-fade-in-up inline-flex items-center gap-2 px-4 py-2 glass-card rounded-full shadow-sm text-sm font-semibold text-paw-brown">
              <span className="w-2 h-2 rounded-full bg-paw-orange animate-pulse" />
              Phones answered. Bookings filled.
            </div>

            <h1 className="animate-fade-in-up-delay-1 text-4xl sm:text-5xl md:text-7xl font-extrabold leading-[1.1] tracking-tight">
              Busy Grooming{" "}
              <span className="text-paw-orange relative inline-block">
                Dogs?
                <svg className="absolute w-full h-3 -bottom-1 left-0 text-paw-amber/50" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="8" fill="none" />
                </svg>
              </span>{" "}
              We Answer the Phone.
            </h1>

            <p className="animate-fade-in-up-delay-2 text-xl text-paw-brown/80 leading-relaxed max-w-lg">
              When you can&apos;t answer the phone, RingPaw does. It talks to customers, books appointments, and texts confirmations automatically.
            </p>

            <div className="animate-fade-in-up-delay-3 flex flex-col sm:flex-row gap-4">
              <Link
                href="/demo"
                className="relative overflow-hidden px-8 py-4 bg-paw-brown text-paw-cream rounded-full font-bold text-lg hover:bg-opacity-90 transition-all shadow-soft flex items-center justify-center gap-2 disabled:opacity-50 btn-shimmer"
              >
                Try the Demo
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
              <a
                href="#how-it-works"
                className="px-8 py-4 bg-white text-paw-brown border-2 border-paw-brown/10 rounded-full font-bold text-lg hover:bg-paw-cream transition-all shadow-sm flex items-center justify-center gap-2"
              >
                See How It Works
              </a>
            </div>

            <div className="animate-fade-in-up-delay-4 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold text-paw-brown/60">
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                Free to set up
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                No credit card needed
              </span>
              <span className="flex items-center gap-1.5">
                <svg className="w-4 h-4 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                Cancel anytime
              </span>
            </div>

          </div>

          {/* Right column - demo call player */}
          <div className="relative animate-fade-in-up-delay-4">
            <div className="absolute inset-0 bg-paw-amber/20 blur-3xl rounded-full transform translate-y-12 pointer-events-none" />
            <div className="relative">
              <p className="text-center text-xs font-bold tracking-widest text-paw-orange uppercase mb-4">
                Hear a real booking call
              </p>
              <DemoCallPlayer audioSrc="/luna-call.wav" />
            </div>
          </div>
        </div>
      </header>

      {/* Stats bar */}
      <section className="py-8 sm:py-12 glass-card border-y border-white/60 shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 grid grid-cols-3 gap-3 sm:gap-8 text-center">
          <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-4 justify-center">
            <div className="text-2xl sm:text-4xl font-extrabold text-paw-orange leading-none">5 min</div>
            <div>
              <div className="text-[10px] sm:text-sm font-semibold text-paw-brown/70 leading-tight">Average Setup Time</div>
              <div className="hidden sm:block text-xs text-paw-brown/35 mt-1">From sign-up to live</div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-4 justify-center">
            <div className="text-2xl sm:text-4xl font-extrabold text-paw-brown leading-none">24/7</div>
            <div>
              <div className="text-[10px] sm:text-sm font-semibold text-paw-brown/70 leading-tight">Availability</div>
              <div className="hidden sm:block text-xs text-paw-brown/35 mt-1">Never miss a call</div>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-1 sm:gap-4 justify-center">
            <div className="text-2xl sm:text-4xl font-extrabold text-paw-amber leading-none">$0</div>
            <div>
              <div className="text-[10px] sm:text-sm font-semibold text-paw-brown/70 leading-tight">Until First Booking</div>
              <div className="hidden sm:block text-xs text-paw-brown/35 mt-1">Free trial, pay on results</div>
            </div>
          </div>
        </div>
      </section>

      <div className="py-6 px-4 sm:px-6">
        <div className="max-w-3xl mx-auto flex flex-wrap justify-center gap-x-8 gap-y-2 text-sm font-semibold text-paw-brown/50">
          <span>No contracts</span>
          <span className="hidden sm:inline text-paw-brown/20">&middot;</span>
          <span>Cancel anytime</span>
          <span className="hidden sm:inline text-paw-brown/20">&middot;</span>
          <span>Pay only on results</span>
          <span className="hidden sm:inline text-paw-brown/20">&middot;</span>
          <span>5-minute setup</span>
        </div>
      </div>

      {/* ROI Calculator */}
      <section className="py-12 sm:py-20 px-4 sm:px-6 relative z-10">
        <div className="max-w-3xl mx-auto">
          <div className="bg-paw-brown rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 lg:p-14 relative overflow-hidden">
            <div className="absolute -right-20 -top-20 w-64 h-64 bg-paw-amber/10 rounded-full blur-3xl" />
            <div className="absolute -left-20 -bottom-20 w-64 h-64 bg-paw-orange/10 rounded-full blur-3xl" />
            <div className="relative z-10">
              <p className="text-sm font-bold tracking-widest text-paw-amber uppercase mb-4">The Real Cost of Missed Calls</p>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-white leading-tight mb-2">
                Most callers don&apos;t leave voicemails. They just call the next groomer.
              </h2>
              <p className="text-white/60 text-base mb-8">See what you&apos;re leaving on the table.</p>

              {/* Sliders */}
              <div className="space-y-6 mb-8">
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-semibold text-white/80">Missed calls per day</label>
                    <span className="text-2xl font-extrabold text-paw-amber">{missedPerDay}</span>
                  </div>
                  <input
                    type="range" min={1} max={20} value={missedPerDay}
                    onChange={(e) => setMissedPerDay(Number(e.target.value))}
                    className="w-full accent-paw-amber h-2 rounded-full cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-white/30 mt-1"><span>1</span><span>20</span></div>
                </div>
                <div>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-semibold text-white/80">Average groom price</label>
                    <span className="text-2xl font-extrabold text-paw-amber">${groomPrice}</span>
                  </div>
                  <input
                    type="range" min={30} max={250} step={5} value={groomPrice}
                    onChange={(e) => setGroomPrice(Number(e.target.value))}
                    className="w-full accent-paw-amber h-2 rounded-full cursor-pointer"
                  />
                  <div className="flex justify-between text-xs text-white/30 mt-1"><span>$30</span><span>$250</span></div>
                </div>
              </div>

              {/* Result */}
              <div className="glass-card-dark border border-white/15 rounded-3xl p-6 mb-8 text-center">
                <p className="text-sm font-semibold text-white/60 mb-1">You&apos;re losing up to</p>
                <p className="text-5xl font-extrabold text-paw-amber">
                  ${(missedPerDay * groomPrice * 5 * 4).toLocaleString()}
                </p>
                <p className="text-white/60 text-sm mt-1">per month in missed bookings</p>
                <p className="text-white/40 text-xs mt-3">
                  {missedPerDay} calls/day × ${groomPrice} × 5 days × 4 weeks
                </p>
                <div className="mt-4 pt-4 border-t border-white/10 text-sm font-semibold text-white/70">
                  RingPaw starts at <span className="text-paw-amber font-bold">$99/mo</span> — it pays for itself the first call it answers.
                </div>
              </div>

              <Link
                href="/demo"
                className="inline-flex items-center gap-2 px-8 py-4 bg-paw-amber text-paw-brown rounded-full font-bold text-lg hover:bg-white transition-colors shadow-lg btn-shimmer"
              >
                Try the Demo
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-12 sm:py-24 px-4 sm:px-6 relative z-10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <p className="text-sm font-bold tracking-widest text-paw-orange uppercase mb-3">Workflow</p>
            <h2 className="text-4xl font-extrabold text-paw-brown">
              It handles the phone, <br />you handle the scissors.
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {/* Step 1 */}
            <div className="bg-paw-cream rounded-[2rem] p-2 shadow-card hover:-translate-y-2 transition-transform duration-300">
              <div className="h-48 bg-paw-sky/50 rounded-[1.5rem] flex items-center justify-center mb-6 relative overflow-hidden">
                <svg className="absolute -bottom-4 -right-4 w-32 h-32 text-paw-sky opacity-50" fill="currentColor" viewBox="0 0 200 200">
                  <path d="M45,-76C58,-69,68,-57,75,-44C82,-31,86,-17,84,-4C82,10,74,22,65,34C56,46,45,58,32,67C19,76,4,82,-10,81C-24,80,-36,72,-48,62C-60,52,-72,40,-78,26C-84,12,-84,-4,-78,-18C-72,-32,-60,-48,-46,-55C-32,-63,-16,-62,0,-62C16,-62,32,-83,45,-76Z" transform="translate(100 100)" />
                </svg>
                <svg className="w-16 h-16 text-paw-brown relative z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <div className="px-6 pb-8">
                <div className="w-8 h-8 rounded-full bg-paw-orange text-white flex items-center justify-center font-bold mb-4">1</div>
                <h4 className="text-xl font-bold mb-2">Missed Call</h4>
                <p className="text-paw-brown/70 leading-relaxed">You&apos;re mid-groom. Phone rings. You can&apos;t stop. That used to mean a lost booking.</p>
              </div>
            </div>

            {/* Step 2 */}
            <div className="bg-paw-cream rounded-[2rem] p-2 shadow-card hover:-translate-y-2 transition-transform duration-300">
              <div className="h-48 bg-paw-amber/30 rounded-[1.5rem] flex items-center justify-center mb-6 relative overflow-hidden">
                <svg className="absolute -top-4 -left-4 w-32 h-32 text-paw-amber opacity-50" fill="currentColor" viewBox="0 0 200 200">
                  <path d="M42.7,-72.6C54.6,-67.2,63.1,-52.8,69.5,-39.3C75.9,-25.8,80.2,-13.2,79.1,-0.6C78,12,71.5,24.6,63.4,36.2C55.3,47.8,45.6,58.3,34,65.3C22.4,72.3,8.9,75.8,-3.4,81.7C-15.7,87.6,-26.8,95.9,-37.2,93.6C-47.6,91.3,-57.3,78.4,-66.1,66.1C-74.9,53.8,-82.8,42.1,-85.4,29.4C-88,16.7,-85.3,3,-81.4,-10C-77.5,-23,-72.4,-35.3,-63.3,-44.6C-54.2,-53.9,-41.1,-60.2,-28.4,-64.7C-15.7,-69.2,-3.4,-71.9,9.4,-73.6C22.2,-75.3,44.4,-76,42.7,-72.6Z" transform="translate(100 100)" />
                </svg>
                <svg className="w-16 h-16 text-paw-brown relative z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                  <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
                  <line x1="12" x2="12" y1="19" y2="22" />
                </svg>
              </div>
              <div className="px-6 pb-8">
                <div className="w-8 h-8 rounded-full bg-paw-orange text-white flex items-center justify-center font-bold mb-4">2</div>
                <h4 className="text-xl font-bold mb-2">AI Answers Instantly</h4>
                <p className="text-paw-brown/70 leading-relaxed">RingPaw answers in seconds. Warm, natural conversation. Asks for their dog&apos;s name, breed, and what service they need.</p>
              </div>
            </div>

            {/* Step 3 */}
            <div className="bg-paw-cream rounded-[2rem] p-2 shadow-card hover:-translate-y-2 transition-transform duration-300">
              <div className="h-48 bg-paw-brown/10 rounded-[1.5rem] flex items-center justify-center mb-6 relative overflow-hidden">
                <svg className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-40 h-40 text-paw-brown/10" fill="currentColor" viewBox="0 0 200 200">
                  <path d="M47.5,-55.5C59.9,-44.7,67.3,-28.3,67.7,-11.9C68.1,4.5,61.4,20.9,51.8,34.4C42.2,47.9,29.7,58.5,15.1,62.8C0.5,67.1,-16.2,65.1,-31.6,57.5C-47,49.9,-61.1,36.7,-66.6,20.8C-72.1,4.9,-69,-13.7,-59.5,-28.6C-50,-43.5,-34.1,-54.7,-18.8,-57.4C-3.5,-60.1,11.8,-54.3,27.1,-48.5C42.4,-42.7,57.7,-36.9,47.5,-55.5Z" transform="translate(100 100)" />
                </svg>
                <svg className="w-16 h-16 text-paw-brown relative z-10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M8 2v4" /><path d="M16 2v4" />
                  <rect width="18" height="18" x="3" y="4" rx="2" />
                  <path d="M3 10h18" /><path d="m9 16 2 2 4-4" />
                </svg>
              </div>
              <div className="px-6 pb-8">
                <div className="w-8 h-8 rounded-full bg-paw-orange text-white flex items-center justify-center font-bold mb-4">3</div>
                <h4 className="text-xl font-bold mb-2">Booked &amp; Texted</h4>
                <p className="text-paw-brown/70 leading-relaxed">Appointment lands in your calendar. Customer gets a confirmation text. You get a summary SMS. Done before you finished the blowout.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-12 sm:py-24 px-4 sm:px-6 bg-white relative overflow-hidden">
        <div className="absolute -left-20 top-20 w-96 h-96 bg-paw-sky rounded-full blur-3xl opacity-50" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold text-paw-brown">Built for Groomers. Not Just Anyone.</h2>
          </div>

          {/* Two hero feature cards */}
          <div className="grid lg:grid-cols-2 gap-8 mb-12">
            {/* Breed-Smart Booking */}
            <div className="bg-paw-cream rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 flex flex-col md:flex-row items-center gap-6 sm:gap-8 shadow-soft group">
              <div className="flex-1 space-y-4">
                <div className="w-12 h-12 bg-paw-sky rounded-2xl flex items-center justify-center text-paw-brown mb-2">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <circle cx="11" cy="11" r="3" /><path d="M6 3.5C6 4.88 4.88 6 3.5 6S1 4.88 1 3.5 2.12 1 3.5 1 6 2.12 6 3.5Z" transform="translate(3 1)" /><path d="M6 3.5C6 4.88 4.88 6 3.5 6S1 4.88 1 3.5 2.12 1 3.5 1 6 2.12 6 3.5Z" transform="translate(11 1)" /><path d="M6 3.5C6 4.88 4.88 6 3.5 6S1 4.88 1 3.5 2.12 1 3.5 1 6 2.12 6 3.5Z" transform="translate(1 8)" /><path d="M6 3.5C6 4.88 4.88 6 3.5 6S1 4.88 1 3.5 2.12 1 3.5 1 6 2.12 6 3.5Z" transform="translate(13 8)" /><ellipse cx="12" cy="19" rx="4" ry="3" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold">Breed-Smart Booking</h3>
                <p className="text-paw-brown/70">Caller mentions their bernedoodle? RingPaw auto-sets the right appointment length, flags matting concerns, and asks the right questions &mdash; without you lifting a finger.</p>
              </div>
              <div className="w-full md:w-48 h-48 bg-white rounded-3xl shadow-inner-light p-4 rotate-3 group-hover:rotate-0 transition-transform duration-300">
                <div className="w-full h-full border border-gray-100 rounded-2xl p-3 flex flex-col gap-2">
                  <div className="text-[10px] font-semibold text-paw-brown/50 uppercase tracking-wide">Bernedoodle</div>
                  <div className="flex-1 bg-paw-sky/30 rounded-xl p-2 flex flex-col gap-1.5">
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-paw-orange" />
                      <div className="text-[9px] text-paw-brown/60">2.5 hr slot</div>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <div className="w-1.5 h-1.5 rounded-full bg-paw-orange" />
                      <div className="text-[9px] text-paw-brown/60">Check matting</div>
                    </div>
                  </div>
                  <div className="flex-1 bg-paw-amber/20 rounded-xl p-2 flex items-center gap-1.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-green-500" />
                    <div className="text-[9px] text-paw-brown/60">Auto-booked</div>
                  </div>
                </div>
              </div>
            </div>

            {/* SMS Control */}
            <div className="bg-paw-brown text-paw-cream rounded-[2rem] sm:rounded-[2.5rem] p-6 sm:p-10 flex flex-col md:flex-row items-center gap-6 sm:gap-8 shadow-soft group">
              <div className="flex-1 space-y-4">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-paw-amber mb-2">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold">Text to Control Everything</h3>
                <p className="text-white/70">Block a day, pause bookings, add a service, check tomorrow&apos;s schedule &mdash; just text RingPaw like you&apos;d text an employee. &quot;Block tomorrow&quot; &rarr; Done.</p>
              </div>
              <div className="w-full md:w-48 h-48 bg-paw-surface/10 rounded-3xl shadow-inner-light p-4 -rotate-3 group-hover:rotate-0 transition-transform duration-300 backdrop-blur-sm border border-white/10">
                <div className="space-y-2.5 pt-3">
                  <div className="bg-white/20 py-1.5 px-2.5 rounded-lg rounded-tl-none w-3/4">
                    <div className="text-[9px] text-white/80">Block tomorrow</div>
                  </div>
                  <div className="bg-paw-amber py-1.5 px-2.5 rounded-lg rounded-tr-none w-3/4 ml-auto">
                    <div className="text-[9px] text-paw-brown font-medium">Done! March 8 blocked.</div>
                  </div>
                  <div className="bg-white/20 py-1.5 px-2.5 rounded-lg rounded-tl-none w-4/5">
                    <div className="text-[9px] text-white/80">Add service: Puppy bath $45</div>
                  </div>
                  <div className="bg-paw-amber py-1.5 px-2.5 rounded-lg rounded-tr-none w-3/4 ml-auto">
                    <div className="text-[9px] text-paw-brown font-medium">Added! Puppy Bath &mdash; $45</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Compact feature grid */}
          <div className="grid sm:grid-cols-2 gap-4">
            {[
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                ),
                title: "Real-Time Calendar Booking",
                desc: "Checks your live availability before offering any slot. No double bookings. Works with Google Calendar, Square, and Acuity Scheduling.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" /><circle cx="9" cy="7" r="4" /><path d="M23 21v-2a4 4 0 0 0-3-3.87" /><path d="M16 3.13a4 4 0 0 1 0 7.75" />
                  </svg>
                ),
                title: "Repeat Customer Recognition",
                desc: "Remembers your regulars. Greets them by name, knows the breed, and skips straight to scheduling. Every caller feels like a VIP.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
                  </svg>
                ),
                title: "Automatic Review Requests",
                desc: "2 hours after pickup, RingPaw texts the owner a warm review request with your Google link. Watch your review count climb weekly.",
              },
              {
                icon: (
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" /><path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                ),
                title: "No-Show Protection",
                desc: "48hr and 24hr reminders sent automatically. If someone cancels, RingPaw texts your waitlist and fills the slot before you notice.",
              },
            ].map((feature) => (
              <div key={feature.title} className="bg-paw-cream/50 rounded-2xl p-5 hover:bg-paw-cream transition-colors duration-200">
                <div className="w-9 h-9 bg-paw-sky/60 rounded-xl flex items-center justify-center text-paw-brown mb-3">
                  {feature.icon}
                </div>
                <h4 className="text-sm font-bold text-paw-brown mb-1">{feature.title}</h4>
                <p className="text-xs text-paw-brown/60 leading-relaxed">{feature.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-12 sm:py-24 px-4 sm:px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold text-paw-brown">Start free. Pay on results.</h2>
            <p className="text-paw-brown/80 mt-4 text-lg font-medium max-w-xl mx-auto">Start your free trial. No credit card required.</p>
          </div>
          <div className="max-w-md mx-auto mb-12 bg-paw-cream border-2 border-paw-amber/40 rounded-2xl p-5 text-center shadow-sm">
            <div className="flex items-center justify-center gap-2 mb-1">
              <svg className="w-6 h-6 text-paw-amber" fill="currentColor" viewBox="0 0 24 24"><path d="M12 1L3 5v6c0 5.55 3.84 10.74 9 12 5.16-1.26 9-6.45 9-12V5l-9-4z" /></svg>
              <span className="text-lg font-extrabold text-paw-brown">30-Day Outcome Guarantee</span>
            </div>
            <p className="text-sm text-paw-brown/70">No credit card needed. You are only charged when Pip books your first appointment. If it does not work in 30 days, you owe nothing.</p>
          </div>
          <div className="max-w-md mx-auto">
            {/* Studio */}
            <div className="bg-paw-brown text-paw-cream p-8 sm:p-10 rounded-[2.5rem] shadow-xl relative card-glow">
              <h3 className="text-xl font-bold text-paw-amber mb-1">Studio</h3>
              <div className="flex items-baseline gap-1 mb-2">
                <span className="text-5xl font-extrabold text-white">$199</span>
                <span className="text-white/50">/mo</span>
              </div>
              <p className="text-sm text-white/70 mb-6 leading-snug">For full-time groomers who want Pip handling every missed call.</p>
              <Link
                href="/onboarding"
                className="block w-full py-4 text-center bg-paw-amber text-paw-brown rounded-full font-bold hover:bg-white transition-colors shadow-lg"
              >
                Get Started
              </Link>
              <ul className="mt-8 space-y-4 text-sm font-medium text-paw-cream">
                <li className="flex gap-3">
                  <svg className="w-5 h-5 text-paw-amber shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  300 Minutes / Month (~150 calls)
                </li>
                <li className="flex gap-3">
                  <svg className="w-5 h-5 text-paw-amber shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  Everything Included
                </li>
                <li className="flex gap-3">
                  <svg className="w-5 h-5 text-paw-amber shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  Square + Google Calendar
                </li>
                <li className="flex gap-3">
                  <svg className="w-5 h-5 text-paw-amber shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  SMS Confirmations & Reminders
                </li>
              </ul>
              <a href="#features" className="mt-6 text-xs font-semibold text-paw-amber hover:underline block text-center">See all features →</a>
            </div>
          </div>

          {/* Guarantee line */}
          <p className="text-center text-base text-paw-brown/70 mt-10 font-semibold">
            All plans include a 30-day outcome guarantee. If RingPaw doesn&apos;t book a single appointment, you pay nothing.
          </p>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-10 sm:py-16 px-4 sm:px-6 max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-paw-brown mb-8 text-center">Common Questions</h2>
        <div className="space-y-4">
          <details className="glass-card rounded-3xl p-6 shadow-sm group cursor-pointer hover:shadow-md transition-shadow duration-200">
            <summary className="list-none flex justify-between items-center font-bold text-lg text-paw-brown">
              What does it actually sound like?
              <span className="group-open:rotate-180 transition-transform">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </span>
            </summary>
            <p className="mt-4 text-paw-brown/70 leading-relaxed">RingPaw uses a warm, conversational voice built for phone calls. It speaks naturally, asks the right follow-up questions, and handles the flow of a real booking conversation &mdash; not a scripted menu. You can hear it for yourself using the demo player above.</p>
          </details>
          <details className="glass-card rounded-3xl p-6 shadow-sm group cursor-pointer hover:shadow-md transition-shadow duration-200">
            <summary className="list-none flex justify-between items-center font-bold text-lg text-paw-brown">
              Will it actually book into my calendar?
              <span className="group-open:rotate-180 transition-transform">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </span>
            </summary>
            <p className="mt-4 text-paw-brown/70 leading-relaxed">Yes &mdash; and it checks live availability before offering any slot. If you&apos;re already booked at 2&nbsp;PM, RingPaw won&apos;t offer 2&nbsp;PM. The moment a caller confirms, the appointment writes directly to Google Calendar, Square, or Acuity. You&apos;ll see it on your calendar within seconds, no copy-pasting required.</p>
          </details>
          <details className="glass-card rounded-3xl p-6 shadow-sm group cursor-pointer hover:shadow-md transition-shadow duration-200">
            <summary className="list-none flex justify-between items-center font-bold text-lg text-paw-brown">
              What if it doesn&apos;t understand something?
              <span className="group-open:rotate-180 transition-transform">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </span>
            </summary>
            <p className="mt-4 text-paw-brown/70 leading-relaxed">RingPaw handles the vast majority of calls on its own &mdash; but when something&apos;s genuinely outside its knowledge, it doesn&apos;t guess or go silent. It tells the caller, &ldquo;Let me have [your name] give you a quick call back,&rdquo; takes their number, and texts you a summary of what they needed. You call back already knowing the context. Nothing falls through the cracks.</p>
          </details>
          <details className="glass-card rounded-3xl p-6 shadow-sm group cursor-pointer hover:shadow-md transition-shadow duration-200">
            <summary className="list-none flex justify-between items-center font-bold text-lg text-paw-brown">
              What happens if the AI makes a mistake?
              <span className="group-open:rotate-180 transition-transform">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </span>
            </summary>
            <p className="mt-4 text-paw-brown/70 leading-relaxed">Pip knows its limits. If a caller asks something unusual or wants to reschedule a complex appointment, Pip takes a message and texts you immediately. You stay in control &mdash; Pip never guesses on your behalf. And because every call is logged with a full transcript, you can review exactly what was said and adjust Pip&apos;s behavior from your dashboard.</p>
          </details>
          <details className="glass-card rounded-3xl p-6 shadow-sm group cursor-pointer hover:shadow-md transition-shadow duration-200">
            <summary className="list-none flex justify-between items-center font-bold text-lg text-paw-brown">
              What calendars does it work with?
              <span className="group-open:rotate-180 transition-transform">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </span>
            </summary>
            <p className="mt-4 text-paw-brown/70 leading-relaxed">Google Calendar, Square Appointments, and Acuity Scheduling. If you use any of these, connecting takes about 30 seconds during setup &mdash; just sign in and authorize. More integrations are on the roadmap. Using something else? Let us know and we&apos;ll prioritize it.</p>
          </details>
          <details className="glass-card rounded-3xl p-6 shadow-sm group cursor-pointer hover:shadow-md transition-shadow duration-200">
            <summary className="list-none flex justify-between items-center font-bold text-lg text-paw-brown">
              Can I change my hours or block a day?
              <span className="group-open:rotate-180 transition-transform">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </span>
            </summary>
            <p className="mt-4 text-paw-brown/70 leading-relaxed">Yes &mdash; update your hours any time from the Settings page. Toggle any day on or off, adjust open and close times, and RingPaw picks up the change immediately. Need to block a holiday or take a personal day? Mark it as busy in your connected calendar and RingPaw will treat that time as unavailable, no extra steps needed.</p>
          </details>
          <details className="glass-card rounded-3xl p-6 shadow-sm group cursor-pointer hover:shadow-md transition-shadow duration-200">
            <summary className="list-none flex justify-between items-center font-bold text-lg text-paw-brown">
              How hard is setup?
              <span className="group-open:rotate-180 transition-transform">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </span>
            </summary>
            <p className="mt-4 text-paw-brown/70 leading-relaxed">Genuinely about 5 minutes. Sign up, enter your business name and services, connect your calendar, and set up conditional call forwarding &mdash; we give you the exact code to dial on your phone. That&apos;s it. RingPaw is live and answering calls. No developer needed, no complicated config, no ongoing maintenance.</p>
          </details>
          <details className="glass-card rounded-3xl p-6 shadow-sm group cursor-pointer hover:shadow-md transition-shadow duration-200">
            <summary className="list-none flex justify-between items-center font-bold text-lg text-paw-brown">
              Is there a contract?
              <span className="group-open:rotate-180 transition-transform">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </span>
            </summary>
            <p className="mt-4 text-paw-brown/70 leading-relaxed">No contracts, no setup fees, no cancellation fees. Month-to-month only. You can cancel from your account settings &mdash; no calls to make, no forms to fill. That said, most groomers who try it don&apos;t cancel. When a $75 groom books itself while you&apos;re elbow-deep in a bernedoodle, it&apos;s hard to go back.</p>
          </details>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-paw-brown text-paw-cream pt-16 pb-10 px-6 mt-12 rounded-t-[3rem]">
        {/* Footer CTA */}
        <div className="max-w-2xl mx-auto text-center mb-14">
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white mb-3">Ready to stop missing calls?</h2>
          <p className="text-white/60 mb-6">No credit card needed · set up in 5 minutes.</p>
          <Link
            href="/demo"
            className="inline-flex items-center gap-2 px-8 py-4 bg-paw-amber text-paw-brown rounded-full font-bold text-lg hover:bg-white transition-colors shadow-lg btn-shimmer"
          >
            Try the Demo
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </Link>
        </div>
        <div className="border-t border-white/10 pt-8 max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-6">
          <div className="flex items-center" style={{ filter: "brightness(0) invert(1)" }}>
            <BrandLogo href="/" mobileWidth={120} desktopWidth={150} />
          </div>
          <div className="flex gap-8 text-sm font-medium text-paw-cream/60">
            <Link href="/privacy-policy" className="hover:text-white transition-colors">Privacy Policy</Link>
            <Link href="/terms" className="hover:text-white transition-colors">Terms &amp; Conditions</Link>
            <a href="#" className="hover:text-white transition-colors">Support</a>
          </div>
          <div className="text-sm text-paw-cream/40">
            &copy; {new Date().getFullYear()} RingPaw. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
