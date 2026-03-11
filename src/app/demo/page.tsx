"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

type Phase = "idle" | "loading" | "waiting" | "in_progress" | "completed" | "rate_limited" | "unavailable" | "error";

function formatPhone(raw: string) {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) {
    return `+1 (${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return raw;
}

export default function DemoPage() {
  const [phase, setPhase] = useState<Phase>("idle");
  const [number, setNumber] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const phaseRef = useRef<Phase>("idle");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => { phaseRef.current = phase; }, [phase]);

  // Restore an existing session from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem("demoSession");
    if (!saved) return;
    try {
      const { token, number: num, startedAt } = JSON.parse(saved) as { token: string; number: string; startedAt: string };
      const age = Date.now() - new Date(startedAt).getTime();
      if (age > 30 * 60 * 1000) {
        localStorage.removeItem("demoSession");
        return;
      }
      setSessionToken(token);
      setNumber(num);
      setPhase("waiting");
      startPolling(token);
    } catch {
      localStorage.removeItem("demoSession");
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function stopPolling() {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }

  function startPolling(token: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/demo/public/status?token=${token}`);
        const data = await res.json() as { phase: string; summary: string | null };
        if (data.phase === "in_progress" && phaseRef.current === "waiting") {
          setPhase("in_progress");
        } else if (data.phase === "completed") {
          setSummary(data.summary);
          setPhase("completed");
          stopPolling();
        }
      } catch { /* ignore */ }
    }, 3000);
  }

  async function startDemo() {
    setPhase("loading");
    try {
      const res = await fetch("/api/demo/public/start", { method: "POST" });
      const data = await res.json() as {
        sessionToken?: string; number?: string; startedAt?: string;
        error?: string; message?: string;
      };

      if (res.status === 429) {
        setPhase("rate_limited");
        return;
      }
      if (res.status === 503) {
        setPhase(data.error === "demo_unavailable" ? "unavailable" : "error");
        return;
      }
      if (!res.ok || !data.number) {
        setPhase("error");
        return;
      }

      const token = data.sessionToken!;
      const num = data.number;
      const startedAt = data.startedAt ?? new Date().toISOString();

      localStorage.setItem("demoSession", JSON.stringify({ token, number: num, startedAt }));
      setSessionToken(token);
      setNumber(num);
      setPhase("waiting");
      startPolling(token);
    } catch {
      setPhase("error");
    }
  }

  function reset() {
    stopPolling();
    localStorage.removeItem("demoSession");
    setPhase("idle");
    setNumber("");
    setSummary(null);
    setSessionToken(null);
  }

  const formattedNumber = number ? formatPhone(number) : "";

  return (
    <div className="min-h-screen bg-paw-sky antialiased flex flex-col relative">
      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <svg className="leaf-shape absolute top-[-10%] left-[-5%] w-[500px] h-[500px] text-paw-amber opacity-60" viewBox="0 0 200 200" fill="currentColor">
          <path d="M100 0C60 40 20 80 0 140C40 130 80 110 100 200C120 110 160 130 200 140C180 80 140 40 100 0Z" />
        </svg>
        <svg className="leaf-shape absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] text-white opacity-50" viewBox="0 0 200 200" fill="currentColor">
          <path d="M100 200C140 160 180 120 200 60C160 70 120 90 100 0C80 90 40 70 0 60C20 120 60 160 100 200Z" />
        </svg>
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 py-5 max-w-4xl mx-auto w-full">
        <Link href="/">
          <BrandLogo mobileWidth={120} desktopWidth={140} priority />
        </Link>
        <Link
          href="/onboarding"
          className="px-5 py-2.5 bg-paw-brown text-paw-cream rounded-full font-bold text-sm hover:bg-opacity-90 transition-all shadow-soft"
        >
          Start Free Trial
        </Link>
      </nav>

      {/* Main content */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-10 relative z-10">
        <div className="w-full max-w-xl">

          {/* Idle state — hero */}
          {phase === "idle" && (
            <div className="text-center animate-in fade-in duration-300">
              <div className="inline-flex items-center gap-2 bg-paw-amber/20 border border-paw-amber/30 text-paw-brown text-xs font-bold px-4 py-1.5 rounded-full mb-6">
                <span className="w-1.5 h-1.5 rounded-full bg-paw-orange animate-pulse" />
                Live AI Demo
              </div>
              <h1 className="text-4xl sm:text-5xl font-extrabold text-paw-brown leading-tight mb-4">
                Hear your AI receptionist.<br />
                <span className="text-paw-orange">Live. Right now.</span>
              </h1>
              <p className="text-paw-brown/60 font-medium text-lg mb-8 max-w-md mx-auto leading-relaxed">
                We&apos;ll give you a real number to call. Your AI will answer, chat naturally, and try to book an appointment — all in one take.
              </p>

              <div className="bg-paw-cream rounded-[2rem] border-4 border-white shadow-soft p-8 mb-6">
                <div className="space-y-4 text-left mb-8">
                  {[
                    { icon: "📞", text: "Call the number we give you" },
                    { icon: "🐾", text: "Ask about grooming, pricing, or try to book" },
                    { icon: "✨", text: "See the full AI summary after the call" },
                  ].map((item) => (
                    <div key={item.text} className="flex items-center gap-3">
                      <span className="w-9 h-9 bg-white rounded-xl flex items-center justify-center shrink-0 shadow-sm text-lg">
                        {item.icon}
                      </span>
                      <span className="text-sm font-semibold text-paw-brown/80">{item.text}</span>
                    </div>
                  ))}
                </div>
                <button
                  onClick={startDemo}
                  className="w-full px-8 py-4 bg-paw-brown text-paw-cream rounded-full font-bold text-lg hover:bg-opacity-90 transition-all shadow-soft flex items-center justify-center gap-2"
                >
                  Get my demo number
                  <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                  </svg>
                </button>
                <p className="text-xs text-paw-brown/40 text-center mt-3">No signup needed · 1 demo per device per day</p>
              </div>
            </div>
          )}

          {/* Loading */}
          {phase === "loading" && (
            <div className="text-center animate-in fade-in duration-300">
              <div className="w-20 h-20 bg-paw-cream rounded-full flex items-center justify-center mx-auto mb-6 shadow-soft">
                <svg className="animate-spin w-8 h-8 text-paw-brown/50" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </div>
              <p className="text-xl font-bold text-paw-brown mb-2">Setting up your demo line…</p>
              <p className="text-paw-brown/50 font-medium text-sm">Takes just a second</p>
            </div>
          )}

          {/* Active demo — waiting / in_progress / completed */}
          {(phase === "waiting" || phase === "in_progress" || phase === "completed") && (
            <div className="bg-paw-cream rounded-[2rem] border-4 border-white shadow-soft p-8 animate-in fade-in duration-300">

              {/* Animated phone icon */}
              <div className="text-center mb-6">
                <div className="relative inline-flex items-center justify-center w-28 h-28 mx-auto mb-4">
                  {phase === "waiting" && (
                    <>
                      <div className="absolute inset-0 rounded-full bg-paw-orange/20 animate-ping" style={{ animationDuration: "1.8s" }} />
                      <div className="absolute inset-3 rounded-full bg-paw-orange/15 animate-ping" style={{ animationDuration: "1.8s", animationDelay: "0.4s" }} />
                    </>
                  )}
                  {phase === "in_progress" && (
                    <>
                      <div className="absolute inset-0 rounded-full bg-amber-400/30 animate-ping" style={{ animationDuration: "1.2s" }} />
                      <div className="absolute inset-3 rounded-full bg-amber-400/20 animate-ping" style={{ animationDuration: "1.2s", animationDelay: "0.3s" }} />
                    </>
                  )}
                  {phase === "completed" && <div className="absolute inset-0 rounded-full bg-green-400/20" />}
                  <div className={`relative w-20 h-20 rounded-full flex items-center justify-center shadow-soft transition-colors duration-500 ${
                    phase === "completed" ? "bg-green-500" : phase === "in_progress" ? "bg-amber-500" : "bg-paw-brown"
                  }`}>
                    {phase === "completed" ? (
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                    ) : (
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                    )}
                  </div>
                </div>

                {phase === "waiting" && (
                  <>
                    <p className="text-xs font-bold text-paw-brown/40 uppercase tracking-widest mb-2">Call this number now</p>
                    <a
                      href={`tel:${number}`}
                      className="block text-4xl font-extrabold text-paw-brown tracking-wide hover:text-paw-orange transition-colors"
                    >
                      {formattedNumber}
                    </a>
                    <p className="text-xs text-paw-brown/40 mt-1">Tap to dial on mobile · or enter manually</p>
                  </>
                )}
                {phase === "in_progress" && (
                  <div className="animate-in fade-in duration-300">
                    <p className="text-lg font-bold text-amber-600 mb-1">Your AI is on the call!</p>
                    <p className="text-sm text-paw-brown/50">We&apos;ll capture the summary when it ends.</p>
                  </div>
                )}
                {phase === "completed" && (
                  <div className="animate-in fade-in duration-300">
                    <p className="text-xl font-extrabold text-green-700 mb-1">🎉 That was your AI!</p>
                    <p className="text-sm text-paw-brown/50">Natural, fast, and ready to book 24/7.</p>
                  </div>
                )}
              </div>

              {/* Sample script — waiting only */}
              {phase === "waiting" && (
                <div className="bg-paw-sky/70 rounded-2xl p-4 border border-paw-brown/8 mb-4">
                  <p className="text-xs font-bold text-paw-brown/50 uppercase tracking-wider mb-2">Try saying →</p>
                  <p className="text-sm text-paw-brown/80 italic leading-relaxed">
                    &ldquo;Hi, I&apos;d like to book a full groom for my golden retriever next Thursday — do you have anything around 10am?&rdquo;
                  </p>
                </div>
              )}

              {/* In-progress banner */}
              {phase === "in_progress" && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 text-center mb-4 animate-in fade-in duration-300">
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-sm font-bold text-amber-700">Listening live</span>
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  </div>
                  <p className="text-xs text-amber-600/70 mt-1">We&apos;ll show the AI&apos;s summary as soon as the call ends.</p>
                </div>
              )}

              {/* AI summary */}
              {phase === "completed" && summary && (
                <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4 mb-4 animate-in fade-in slide-in-from-bottom-3 duration-400">
                  <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">AI Call Summary</p>
                  <p className="text-sm text-paw-brown/80 leading-relaxed">{summary}</p>
                </div>
              )}

              {/* Waiting dots + manual skip */}
              {phase === "waiting" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-3 py-1 text-paw-brown/40 text-xs font-bold">
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-paw-brown/30 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-paw-brown/30 animate-bounce" style={{ animationDelay: "120ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-paw-brown/30 animate-bounce" style={{ animationDelay: "240ms" }} />
                    </span>
                    Waiting for your call
                  </div>
                  <button
                    onClick={() => { stopPolling(); setPhase("completed"); }}
                    className="w-full py-3 rounded-full border-2 border-paw-brown/10 text-paw-brown/50 text-sm font-bold hover:border-paw-brown/25 hover:text-paw-brown/70 transition-all"
                  >
                    I&apos;ve already called ✓
                  </button>
                </div>
              )}

              {/* Post-call CTA */}
              {phase === "completed" && (
                <div className="mt-2 space-y-3 animate-in fade-in duration-400">
                  <Link
                    href="/onboarding"
                    className="block w-full py-4 bg-paw-brown text-paw-cream rounded-full font-bold text-center text-lg hover:bg-opacity-90 transition-all shadow-soft"
                  >
                    Set this up for my shop →
                  </Link>
                  <p className="text-xs text-paw-brown/40 text-center">
                    Card required · only charged after your first booking
                  </p>
                  <button
                    onClick={reset}
                    className="w-full py-2 text-xs text-paw-brown/40 hover:text-paw-brown/60 transition-colors"
                  >
                    Start over
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Rate limited */}
          {phase === "rate_limited" && (
            <div className="bg-paw-cream rounded-[2rem] border-4 border-white shadow-soft p-10 text-center animate-in fade-in duration-300">
              <div className="text-4xl mb-4">🐾</div>
              <h2 className="text-2xl font-extrabold text-paw-brown mb-3">You&apos;ve already tried the demo!</h2>
              <p className="text-paw-brown/60 font-medium mb-8 leading-relaxed">
                Demos are limited to once per day. Ready to set it up for your own grooming shop?
              </p>
              <Link
                href="/onboarding"
                className="block w-full py-4 bg-paw-brown text-paw-cream rounded-full font-bold text-lg hover:bg-opacity-90 transition-all shadow-soft mb-3"
              >
                Start my free trial →
              </Link>
              <Link href="/" className="text-sm text-paw-brown/50 hover:text-paw-brown transition-colors">
                Back to home
              </Link>
            </div>
          )}

          {/* Demo unavailable */}
          {phase === "unavailable" && (
            <div className="bg-paw-cream rounded-[2rem] border-4 border-white shadow-soft p-10 text-center animate-in fade-in duration-300">
              <div className="text-4xl mb-4">😅</div>
              <h2 className="text-2xl font-extrabold text-paw-brown mb-3">All demo lines are busy</h2>
              <p className="text-paw-brown/60 font-medium mb-8">
                Every line is in use right now. Try again in a minute, or just sign up — setup takes 5 minutes.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={startDemo}
                  className="w-full py-4 bg-paw-brown text-paw-cream rounded-full font-bold text-lg hover:bg-opacity-90 transition-all shadow-soft"
                >
                  Try again
                </button>
                <Link
                  href="/onboarding"
                  className="block w-full py-3 rounded-full border-2 border-paw-brown/20 font-bold text-paw-brown text-center hover:bg-paw-sky transition-colors"
                >
                  Sign up instead
                </Link>
              </div>
            </div>
          )}

          {/* Generic error */}
          {phase === "error" && (
            <div className="bg-paw-cream rounded-[2rem] border-4 border-white shadow-soft p-10 text-center animate-in fade-in duration-300">
              <div className="text-4xl mb-4">⚡</div>
              <h2 className="text-2xl font-extrabold text-paw-brown mb-3">Something went wrong</h2>
              <p className="text-paw-brown/60 font-medium mb-8">Couldn&apos;t start the demo. Please try again.</p>
              <button
                onClick={() => setPhase("idle")}
                className="w-full py-4 bg-paw-brown text-paw-cream rounded-full font-bold text-lg hover:bg-opacity-90 transition-all shadow-soft"
              >
                Try again
              </button>
            </div>
          )}

        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 text-center py-6 text-xs text-paw-brown/40 font-medium">
        © {new Date().getFullYear()} RingPaw · <Link href="/" className="hover:text-paw-brown transition-colors">ringpaw.com</Link>
      </footer>
    </div>
  );
}
