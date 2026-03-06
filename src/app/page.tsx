"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

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
  const [authError, setAuthError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isResolvingRedirect, setIsResolvingRedirect] = useState(false);

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

  const handleStartTrial = () => {
    setAuthError("");
    setIsSigningIn(true);
    // Land back on the root page so post-auth routing can decide whether this
    // user should resume onboarding or go straight to the dashboard.
    signIn("google", { callbackUrl: "/" }).catch(() => {
      setAuthError("Google sign-in failed. Check your auth configuration.");
      setIsSigningIn(false);
    });
  };

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
          className="leaf-shape absolute top-[-10%] left-[-5%] w-[300px] sm:w-[500px] h-[300px] sm:h-[500px] text-paw-amber"
          viewBox="0 0 200 200"
          fill="currentColor"
        >
          <path d="M100 0C60 40 20 80 0 140C40 130 80 110 100 200C120 110 160 130 200 140C180 80 140 40 100 0Z" />
        </svg>
        <svg
          className="leaf-shape absolute bottom-[-10%] right-[-5%] w-[300px] sm:w-[600px] h-[300px] sm:h-[600px] text-white opacity-60"
          viewBox="0 0 200 200"
          fill="currentColor"
        >
          <path d="M100 200C140 160 180 120 200 60C160 70 120 90 100 0C80 90 40 70 0 60C20 120 60 160 100 200Z" />
        </svg>
      </div>

      {/* Nav */}
      <nav className="relative z-50 w-full px-4 sm:px-6 py-4 sm:py-6 flex justify-between items-center max-w-7xl mx-auto">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-paw-brown rounded-full flex items-center justify-center text-paw-amber">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2v7.31" /><path d="M14 2v7.31" /><path d="M8.5 2h7" /><path d="M14 9.3a6.5 6.5 0 1 1-4 0" />
            </svg>
          </div>
          <span className="font-bold text-2xl tracking-tight text-paw-brown">
            RingPaw<span className="text-paw-orange">.ai</span>
          </span>
        </div>
        <div className="hidden md:flex gap-8 font-medium text-paw-brown/80">
          <a href="#how-it-works" className="hover:text-paw-brown transition-colors">How it Works</a>
          <a href="#features" className="hover:text-paw-brown transition-colors">Features</a>
          <a href="#pricing" className="hover:text-paw-brown transition-colors">Pricing</a>
        </div>
        <button
          onClick={() => void handleStartTrial()}
          disabled={isSigningIn}
          className="px-5 py-2.5 sm:px-6 sm:py-3 bg-paw-brown text-paw-cream rounded-full font-semibold text-sm sm:text-base hover:bg-opacity-90 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 disabled:opacity-50"
        >
          {isSigningIn ? "..." : "Start Free"}
        </button>
      </nav>

      {/* Hero */}
      <header className="relative z-10 pt-8 sm:pt-12 pb-16 sm:pb-24 px-4 sm:px-6">
        <div className="max-w-7xl mx-auto grid lg:grid-cols-2 gap-16 items-center">
          {/* Left column */}
          <div className="space-y-8">
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-paw-surface rounded-full shadow-sm text-sm font-semibold text-paw-brown border border-white/50">
              <span className="w-2 h-2 rounded-full bg-paw-orange animate-pulse" />
              Now booking 24/7 automatically
            </div>

            <h1 className="text-4xl sm:text-5xl md:text-7xl font-extrabold leading-[1.1] tracking-tight">
              Never Miss a <br />
              <span className="text-paw-orange relative inline-block">
                Grooming
                <svg className="absolute w-full h-3 -bottom-1 left-0 text-paw-amber/50" viewBox="0 0 100 10" preserveAspectRatio="none">
                  <path d="M0 5 Q 50 10 100 5" stroke="currentColor" strokeWidth="8" fill="none" />
                </svg>
              </span>{" "}
              Call Again.
            </h1>

            <p className="text-xl text-paw-brown/80 leading-relaxed max-w-lg">
              Your new AI receptionist answers missed calls, books appointments, and chats with pet parents while you focus on the pups.
            </p>

            <div className="flex flex-col sm:flex-row gap-4">
              <button
                onClick={() => void handleStartTrial()}
                disabled={isSigningIn}
                className="px-8 py-4 bg-paw-brown text-paw-cream rounded-full font-bold text-lg hover:bg-opacity-90 transition-all shadow-soft flex items-center justify-center gap-2 disabled:opacity-50"
              >
                {isSigningIn ? "Redirecting..." : "Start Free Trial"}
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                </svg>
              </button>
              <a
                href="#how-it-works"
                className="px-8 py-4 bg-paw-cream text-paw-brown border-2 border-paw-brown/10 rounded-full font-bold text-lg hover:bg-white transition-all shadow-sm flex items-center justify-center"
              >
                See How It Works
              </a>
            </div>

            {authError ? (
              <p className="text-sm text-red-600">{authError}</p>
            ) : null}

            <div className="pt-4 flex items-center gap-4 text-sm font-medium text-paw-brown/70">
              <div className="flex -space-x-3">
                <img src="https://i.pravatar.cc/100?img=1" alt="User" className="w-10 h-10 rounded-full border-2 border-paw-sky" />
                <img src="https://i.pravatar.cc/100?img=5" alt="User" className="w-10 h-10 rounded-full border-2 border-paw-sky" />
                <img src="https://i.pravatar.cc/100?img=9" alt="User" className="w-10 h-10 rounded-full border-2 border-paw-sky" />
              </div>
              <p>Trusted by 500+ Groomers</p>
            </div>
          </div>

          {/* Right column - phone mockup */}
          <div className="relative hidden sm:block">
            <div className="absolute inset-0 bg-paw-amber/20 blur-3xl rounded-full transform translate-y-12" />

            <div className="relative bg-paw-cream rounded-[2.5rem] p-6 shadow-soft border-4 border-white">
              <div className="flex justify-between items-center mb-8 px-2">
                <div className="w-8 h-8 bg-paw-brown/10 rounded-full flex items-center justify-center">
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3E2919" strokeWidth="3">
                    <path d="M15 6v12a3 3 0 1 0 3-3H6a3 3 0 1 0 3 3V6a3 3 0 1 0-3 3h12a3 3 0 1 0-3-3" />
                  </svg>
                </div>
                <span className="font-bold text-paw-brown">Incoming Call</span>
                <div className="w-8 h-8 rounded-full bg-paw-orange/20" />
              </div>

              <div className="bg-paw-amber/20 rounded-3xl p-8 text-center relative overflow-hidden">
                <div className="absolute -right-10 -top-10 w-32 h-32 bg-paw-orange/20 rounded-full blur-xl" />
                <div className="w-24 h-24 mx-auto bg-white rounded-full flex items-center justify-center mb-4 shadow-sm relative">
                  <span className="absolute inset-0 rounded-full border-4 border-paw-orange/30 animate-ping" />
                  <span className="text-3xl">&#x1F43E;</span>
                </div>
                <h3 className="text-2xl font-bold text-paw-brown mb-1">Max&apos;s Mom</h3>
                <p className="text-paw-brown/60 text-sm font-medium tracking-wide mb-6">AI AGENT ACTIVE</p>

                <div className="bg-white/80 backdrop-blur-sm rounded-2xl p-4 text-left shadow-sm mb-4">
                  <p className="text-xs text-paw-brown/50 font-bold mb-1">AI ASSISTANT</p>
                  <p className="text-sm font-medium leading-snug">&quot;Hi there! This is RingPaw for Happy Paws Grooming. I can help you book an appointment for Max. What date works best?&quot;</p>
                </div>

                <div className="bg-paw-brown/5 rounded-2xl p-4 text-left shadow-sm">
                  <p className="text-xs text-paw-brown/50 font-bold mb-1">CUSTOMER</p>
                  <p className="text-sm font-medium leading-snug">&quot;Can we do next Thursday at 2pm?&quot;</p>
                </div>
              </div>
            </div>

            {/* Floating booking confirmation */}
            <div className="absolute -bottom-4 left-0 sm:-bottom-8 sm:-left-8 bg-white p-3 sm:p-5 rounded-2xl sm:rounded-3xl shadow-soft flex items-center gap-3 sm:gap-4 animate-bounce max-w-[90%] sm:max-w-none" style={{ animationDuration: "3s" }}>
              <div className="w-12 h-12 rounded-full bg-paw-sky flex items-center justify-center text-paw-brown">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
                </svg>
              </div>
              <div>
                <p className="text-xs font-bold text-paw-brown/50 uppercase">Booking Confirmed</p>
                <p className="text-lg font-bold text-paw-brown">Thursday, 2:00 PM</p>
              </div>
            </div>
          </div>
        </div>
      </header>

      {/* Stats bar */}
      <section className="py-12 bg-paw-cream/50 border-y border-white/50 backdrop-blur-md">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 md:grid-cols-3 gap-8 text-center md:text-left">
          <div className="flex items-center gap-4 justify-center md:justify-start">
            <div className="text-4xl font-extrabold text-paw-orange">12k+</div>
            <div className="text-sm font-semibold text-paw-brown/70 leading-tight">Missed Calls<br />Answered</div>
          </div>
          <div className="flex items-center gap-4 justify-center md:justify-start">
            <div className="text-4xl font-extrabold text-paw-brown">$4M+</div>
            <div className="text-sm font-semibold text-paw-brown/70 leading-tight">Revenue<br />Protected</div>
          </div>
          <div className="flex items-center gap-4 justify-center md:justify-start">
            <div className="text-4xl font-extrabold text-paw-amber">850</div>
            <div className="text-sm font-semibold text-paw-brown/70 leading-tight">Grooming Shops<br />Trust RingPaw</div>
          </div>
        </div>
      </section>

      {/* How it works */}
      <section id="how-it-works" className="py-24 px-6 relative z-10">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-sm font-bold tracking-widest text-paw-orange uppercase mb-3">Workflow</h2>
            <h3 className="text-4xl font-extrabold text-paw-brown">
              It handles the phone, <br />you handle the scissors.
            </h3>
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
                <p className="text-paw-brown/70 leading-relaxed">You&apos;re busy bathing a Golden Retriever. The phone rings, but you can&apos;t pick up.</p>
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
                <p className="text-paw-brown/70 leading-relaxed">RingPaw picks up immediately. It sounds human, friendly, and knows your schedule.</p>
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
                <p className="text-paw-brown/70 leading-relaxed">The appointment is added to your calendar, and the owner gets a confirmation text.</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Live Demo Conversation */}
      <section className="py-24 px-6 relative z-10">
        <div className="max-w-4xl mx-auto">
          <div className="text-center mb-12">
            <h2 className="text-sm font-bold tracking-widest text-paw-orange uppercase mb-3">Hear it in action</h2>
            <h3 className="text-4xl font-extrabold text-paw-brown">
              A real AI conversation
            </h3>
            <p className="text-paw-brown/70 mt-4 max-w-lg mx-auto">
              This is what your callers actually experience. Natural, friendly, and gets straight to booking.
            </p>
          </div>

          <DemoConversation />
        </div>
      </section>

      {/* Features */}
      <section id="features" className="py-24 px-6 bg-white relative overflow-hidden">
        <div className="absolute -left-20 top-20 w-96 h-96 bg-paw-sky rounded-full blur-3xl opacity-50" />
        <div className="max-w-7xl mx-auto relative z-10">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold text-paw-brown">Built for Grooming Businesses</h2>
          </div>
          <div className="grid lg:grid-cols-2 gap-8">
            {/* Calendar Sync */}
            <div className="bg-paw-cream rounded-[2.5rem] p-10 flex flex-col md:flex-row items-center gap-8 shadow-soft group">
              <div className="flex-1 space-y-4">
                <div className="w-12 h-12 bg-paw-sky rounded-2xl flex items-center justify-center text-paw-brown mb-2">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold">Smart Calendar Sync</h3>
                <p className="text-paw-brown/70">RingPaw integrates directly with Google Calendar, Square, and DaySmart. No double bookings, ever.</p>
              </div>
              <div className="w-full md:w-48 h-48 bg-white rounded-3xl shadow-inner-light p-4 rotate-3 group-hover:rotate-0 transition-transform duration-300">
                <div className="w-full h-full border border-gray-100 rounded-2xl p-2 flex flex-col gap-2">
                  <div className="h-2 w-1/2 bg-gray-100 rounded" />
                  <div className="flex-1 bg-paw-sky/30 rounded-xl p-2">
                    <div className="w-2 h-2 rounded-full bg-paw-orange mb-1" />
                    <div className="h-1.5 w-12 bg-paw-brown/20 rounded" />
                  </div>
                  <div className="flex-1 bg-paw-amber/20 rounded-xl p-2">
                    <div className="w-2 h-2 rounded-full bg-paw-brown mb-1" />
                    <div className="h-1.5 w-16 bg-paw-brown/20 rounded" />
                  </div>
                </div>
              </div>
            </div>

            {/* SMS Control */}
            <div className="bg-paw-brown text-paw-cream rounded-[2.5rem] p-10 flex flex-col md:flex-row items-center gap-8 shadow-soft group">
              <div className="flex-1 space-y-4">
                <div className="w-12 h-12 bg-white/10 rounded-2xl flex items-center justify-center text-paw-amber mb-2">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </div>
                <h3 className="text-2xl font-bold">SMS Control Center</h3>
                <p className="text-white/70">Take over the conversation anytime. Read transcripts and reply via text message instantly.</p>
              </div>
              <div className="w-full md:w-48 h-48 bg-paw-surface/10 rounded-3xl shadow-inner-light p-4 -rotate-3 group-hover:rotate-0 transition-transform duration-300 backdrop-blur-sm border border-white/10">
                <div className="space-y-3 pt-4">
                  <div className="bg-white/20 p-2 rounded-lg rounded-tl-none w-3/4">
                    <div className="h-1.5 bg-white/50 rounded w-full" />
                  </div>
                  <div className="bg-paw-amber text-paw-brown p-2 rounded-lg rounded-tr-none w-3/4 ml-auto">
                    <div className="h-1.5 bg-paw-brown/50 rounded w-full" />
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section id="pricing" className="py-24 px-6 relative">
        <div className="max-w-7xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-4xl font-extrabold text-paw-brown">Simple Pricing</h2>
            <p className="text-paw-brown/70 mt-4">Pays for itself with just one saved appointment. No surprise bills, ever.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8 items-center">
            {/* Starter */}
            <div className="bg-white p-8 rounded-[2rem] shadow-card border border-gray-100">
              <h3 className="text-xl font-bold text-paw-brown mb-2">Starter</h3>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold">$49</span>
                <span className="text-gray-500">/mo</span>
              </div>
              <p className="text-sm text-gray-500 mb-8 h-10">Perfect for solo groomers getting started.</p>
              <button
                onClick={() => void handleStartTrial()}
                disabled={isSigningIn}
                className="w-full py-3 border-2 border-paw-brown rounded-full font-bold text-paw-brown hover:bg-paw-brown hover:text-white transition-colors disabled:opacity-50"
              >
                {isSigningIn ? "Redirecting..." : "Start Free Trial"}
              </button>
              <ul className="mt-8 space-y-4 text-sm font-medium text-paw-brown/80">
                <li className="flex gap-3">
                  <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  50 Minutes / Month
                </li>
                <li className="flex gap-3">
                  <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  1 Calendar Connection
                </li>
                <li className="flex gap-3">
                  <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  SMS Notifications
                </li>
              </ul>
            </div>

            {/* Growth */}
            <div className="bg-paw-brown text-paw-cream p-8 sm:p-10 rounded-[2.5rem] shadow-xl relative md:transform md:scale-105 z-10">
              <div className="absolute top-0 right-0 bg-paw-amber text-paw-brown text-xs font-bold px-4 py-2 rounded-bl-2xl rounded-tr-2xl">MOST POPULAR</div>
              <h3 className="text-xl font-bold text-paw-amber mb-2">Growth</h3>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-5xl font-extrabold text-white">$149</span>
                <span className="text-white/50">/mo</span>
              </div>
              <p className="text-sm text-white/70 mb-8 h-10">For busy shops ready to grow.</p>
              <button
                onClick={() => void handleStartTrial()}
                disabled={isSigningIn}
                className="w-full py-4 bg-paw-amber text-paw-brown rounded-full font-bold hover:bg-white transition-colors shadow-lg disabled:opacity-50"
              >
                {isSigningIn ? "Redirecting..." : "Start Free Trial"}
              </button>
              <ul className="mt-8 space-y-4 text-sm font-medium text-paw-cream">
                <li className="flex gap-3">
                  <svg className="w-5 h-5 text-paw-amber shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  200 Minutes / Month
                </li>
                <li className="flex gap-3">
                  <svg className="w-5 h-5 text-paw-amber shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  Full SMS Control
                </li>
                <li className="flex gap-3">
                  <svg className="w-5 h-5 text-paw-amber shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  Custom Voice & Personality
                </li>
                <li className="flex gap-3">
                  <svg className="w-5 h-5 text-paw-amber shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  Call Analytics
                </li>
              </ul>
            </div>

            {/* Pro */}
            <div className="bg-white p-8 rounded-[2rem] shadow-card border border-gray-100">
              <h3 className="text-xl font-bold text-paw-brown mb-2">Pro</h3>
              <div className="flex items-baseline gap-1 mb-6">
                <span className="text-4xl font-extrabold">$299</span>
                <span className="text-gray-500">/mo</span>
              </div>
              <p className="text-sm text-gray-500 mb-8 h-10">High-volume shops & multi-location.</p>
              <button
                onClick={() => void handleStartTrial()}
                disabled={isSigningIn}
                className="w-full py-3 border-2 border-paw-brown rounded-full font-bold text-paw-brown hover:bg-paw-brown hover:text-white transition-colors disabled:opacity-50"
              >
                {isSigningIn ? "Redirecting..." : "Start Free Trial"}
              </button>
              <ul className="mt-8 space-y-4 text-sm font-medium text-paw-brown/80">
                <li className="flex gap-3">
                  <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  500 Minutes / Month
                </li>
                <li className="flex gap-3">
                  <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  Priority Support
                </li>
                <li className="flex gap-3">
                  <svg className="w-5 h-5 text-green-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" /></svg>
                  Multiple Locations
                </li>
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* Testimonials */}
      <section className="py-24 px-6">
        <div className="max-w-7xl mx-auto">
          <h2 className="text-3xl font-bold text-paw-brown mb-12 text-center">Loved by Groomers</h2>
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-paw-cream p-8 rounded-[2rem] flex items-start gap-6 shadow-sm">
              <img src="https://i.pravatar.cc/150?img=5" alt="Sarah" className="w-16 h-16 rounded-full object-cover border-4 border-white" />
              <div>
                <h4 className="text-xl font-bold text-paw-brown">Sarah Jenkins</h4>
                <p className="text-xs font-bold text-paw-orange uppercase mb-3">Happy Paws Spa</p>
                <p className="text-paw-brown/80 italic">&quot;I used to miss 5 calls a day while drying dogs. RingPaw paid for itself in the first week. It sounds so real my clients don&apos;t even know it&apos;s AI.&quot;</p>
              </div>
            </div>
            <div className="bg-paw-cream p-8 rounded-[2rem] flex items-start gap-6 shadow-sm">
              <img src="https://i.pravatar.cc/150?img=11" alt="Mike" className="w-16 h-16 rounded-full object-cover border-4 border-white" />
              <div>
                <h4 className="text-xl font-bold text-paw-brown">Mike Ross</h4>
                <p className="text-xs font-bold text-paw-orange uppercase mb-3">The Groom Room</p>
                <p className="text-paw-brown/80 italic">&quot;The calendar integration is seamless. I just check my phone and see new bookings pop up. Best investment I&apos;ve made.&quot;</p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section className="py-16 px-6 max-w-4xl mx-auto">
        <h2 className="text-3xl font-bold text-paw-brown mb-8 text-center">Common Questions</h2>
        <div className="space-y-4">
          <details className="bg-white rounded-3xl p-6 shadow-sm group cursor-pointer">
            <summary className="list-none flex justify-between items-center font-bold text-lg text-paw-brown">
              Does it sound like a robot?
              <span className="group-open:rotate-180 transition-transform">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </span>
            </summary>
            <p className="mt-4 text-paw-brown/70 leading-relaxed">Not at all. We use advanced voice synthesis that includes natural pauses and friendly intonation. Most callers believe they are speaking to a human receptionist.</p>
          </details>
          <details className="bg-white rounded-3xl p-6 shadow-sm group cursor-pointer">
            <summary className="list-none flex justify-between items-center font-bold text-lg text-paw-brown">
              How hard is setup?
              <span className="group-open:rotate-180 transition-transform">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
              </span>
            </summary>
            <p className="mt-4 text-paw-brown/70 leading-relaxed">It takes about 10 minutes. Just forward your missed calls to the number we provide, and connect your calendar.</p>
          </details>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-paw-brown text-paw-cream py-16 px-6 mt-12 rounded-t-[3rem]">
        <div className="max-w-7xl mx-auto flex flex-col md:flex-row justify-between items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-paw-amber rounded-full flex items-center justify-center text-paw-brown">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10 2v7.31" /><path d="M14 2v7.31" /><path d="M8.5 2h7" /><path d="M14 9.3a6.5 6.5 0 1 1-4 0" />
              </svg>
            </div>
            <span className="font-bold text-xl tracking-tight">
              RingPaw<span className="text-paw-amber">.ai</span>
            </span>
          </div>
          <div className="flex gap-8 text-sm font-medium text-paw-cream/60">
            <a href="#" className="hover:text-white transition-colors">Privacy Policy</a>
            <a href="#" className="hover:text-white transition-colors">Terms of Service</a>
            <a href="#" className="hover:text-white transition-colors">Support</a>
          </div>
          <div className="text-sm text-paw-cream/40">
            &copy; {new Date().getFullYear()} RingPaw AI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}

const DEMO_MESSAGES = [
  { role: "ai" as const, text: "Hi there! You've reached Happy Paws Grooming. Sarah's with a client right now, but I can help you book an appointment. What's your name?" },
  { role: "caller" as const, text: "Hey! I'm Jessica. I need to get my dog groomed." },
  { role: "ai" as const, text: "Nice to meet you, Jessica! What's your pup's name and breed?" },
  { role: "caller" as const, text: "His name is Cooper, he's a Goldendoodle." },
  { role: "ai" as const, text: "Oh I love Goldendoodles! What service are you looking for? We do full grooms, bath and brush, or just nail trims." },
  { role: "caller" as const, text: "Full groom please. He's getting pretty shaggy." },
  { role: "ai" as const, text: "Ha, totally get it! For a Goldendoodle full groom, that runs about $85 and takes around 2 hours. When works best for you?" },
  { role: "caller" as const, text: "Do you have anything this Saturday morning?" },
  { role: "ai" as const, text: "Let me check... I've got a 9 AM or 11 AM open this Saturday. Which works better?" },
  { role: "caller" as const, text: "9 AM is perfect!" },
  { role: "ai" as const, text: "Awesome! I've got Cooper the Goldendoodle booked for a full groom this Saturday at 9 AM. You'll get a confirmation text shortly. Is there anything else I can help with?" },
  { role: "caller" as const, text: "Nope, that's it. Thanks!" },
  { role: "ai" as const, text: "You're welcome, Jessica! Cooper's going to look amazing. See you Saturday!" },
];

function DemoConversation() {
  const [visibleCount, setVisibleCount] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);

  useEffect(() => {
    if (!isPlaying || visibleCount >= DEMO_MESSAGES.length) {
      if (visibleCount >= DEMO_MESSAGES.length) setIsPlaying(false);
      return;
    }

    const msg = DEMO_MESSAGES[visibleCount];
    const delay = msg.role === "ai" ? 1800 : 1200;

    const timer = setTimeout(() => {
      setVisibleCount((c) => c + 1);
    }, delay);

    return () => clearTimeout(timer);
  }, [isPlaying, visibleCount]);

  useEffect(() => {
    const el = document.getElementById("demo-chat-scroll");
    if (el) el.scrollTop = el.scrollHeight;
  }, [visibleCount]);

  function handlePlay() {
    if (visibleCount >= DEMO_MESSAGES.length) {
      setVisibleCount(0);
    }
    setHasStarted(true);
    setIsPlaying(true);
    if (visibleCount === 0) {
      setVisibleCount(1);
    }
  }

  return (
    <div className="bg-white rounded-[2.5rem] shadow-soft border border-gray-100 overflow-hidden">
      {/* Phone header */}
      <div className="bg-paw-brown px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-paw-amber/20 rounded-full flex items-center justify-center">
            <span className="text-lg">&#x1F43E;</span>
          </div>
          <div>
            <p className="text-white font-bold text-sm">RingPaw AI</p>
            <p className="text-white/60 text-xs">Happy Paws Grooming</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isPlaying && (
            <span className="flex items-center gap-1.5 text-paw-amber text-xs font-bold">
              <span className="w-2 h-2 rounded-full bg-paw-amber animate-pulse" />
              LIVE
            </span>
          )}
          <span className="text-white/40 text-xs">
            {visibleCount > 0 ? `${Math.min(Math.ceil(visibleCount * 0.3), 2)}:${String(Math.round(visibleCount * 7) % 60).padStart(2, "0")}` : "0:00"}
          </span>
        </div>
      </div>

      {/* Chat area */}
      <div
        id="demo-chat-scroll"
        className="px-4 sm:px-6 py-6 space-y-4 max-h-[420px] overflow-y-auto scroll-smooth"
        style={{ minHeight: "320px" }}
      >
        {!hasStarted && (
          <div className="flex flex-col items-center justify-center py-12 text-center">
            <div className="w-20 h-20 bg-paw-sky rounded-full flex items-center justify-center mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#3E2919" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
            </div>
            <p className="text-paw-brown font-bold text-lg mb-1">Watch a sample call</p>
            <p className="text-paw-brown/60 text-sm">See exactly how RingPaw handles a real booking call</p>
          </div>
        )}

        {DEMO_MESSAGES.slice(0, visibleCount).map((msg, i) => (
          <div
            key={i}
            className={`flex ${msg.role === "caller" ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[80%] sm:max-w-[70%] px-4 py-3 rounded-2xl text-sm leading-relaxed ${
                msg.role === "ai"
                  ? "bg-paw-cream text-paw-brown rounded-bl-md"
                  : "bg-paw-brown text-white rounded-br-md"
              }`}
            >
              <p className={`text-[10px] font-bold uppercase mb-1 ${msg.role === "ai" ? "text-paw-orange" : "text-white/50"}`}>
                {msg.role === "ai" ? "AI Receptionist" : "Caller"}
              </p>
              {msg.text}
            </div>
          </div>
        ))}

        {isPlaying && visibleCount < DEMO_MESSAGES.length && (
          <div className={`flex ${DEMO_MESSAGES[visibleCount].role === "caller" ? "justify-end" : "justify-start"}`}>
            <div className={`px-4 py-3 rounded-2xl ${DEMO_MESSAGES[visibleCount].role === "ai" ? "bg-paw-cream rounded-bl-md" : "bg-paw-brown rounded-br-md"}`}>
              <div className="flex gap-1">
                <span className={`w-2 h-2 rounded-full animate-bounce ${DEMO_MESSAGES[visibleCount].role === "ai" ? "bg-paw-brown/30" : "bg-white/50"}`} style={{ animationDelay: "0ms" }} />
                <span className={`w-2 h-2 rounded-full animate-bounce ${DEMO_MESSAGES[visibleCount].role === "ai" ? "bg-paw-brown/30" : "bg-white/50"}`} style={{ animationDelay: "150ms" }} />
                <span className={`w-2 h-2 rounded-full animate-bounce ${DEMO_MESSAGES[visibleCount].role === "ai" ? "bg-paw-brown/30" : "bg-white/50"}`} style={{ animationDelay: "300ms" }} />
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Controls */}
      <div className="px-6 py-4 border-t border-gray-100 flex items-center justify-between">
        <button
          onClick={handlePlay}
          className="px-6 py-2.5 bg-paw-brown text-white rounded-full font-bold text-sm hover:bg-paw-brown/90 transition-colors flex items-center gap-2"
        >
          {!hasStarted ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              Play Demo Call
            </>
          ) : visibleCount >= DEMO_MESSAGES.length ? (
            <>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" />
              </svg>
              Replay
            </>
          ) : (
            <>
              <span className="w-2 h-2 rounded-full bg-paw-amber animate-pulse" />
              Call in progress...
            </>
          )}
        </button>

        {visibleCount >= DEMO_MESSAGES.length && (
          <div className="flex items-center gap-2 text-sm">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
            <span className="font-bold text-green-600">Booked in under 2 min</span>
          </div>
        )}
      </div>
    </div>
  );
}
