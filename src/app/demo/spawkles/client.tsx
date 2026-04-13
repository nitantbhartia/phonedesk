"use client";

import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";

// ─── Types ────────────────────────────────────────────────────────────────────

type LivePhase =
  | "loading"
  | "waiting"
  | "in_progress"
  | "completed"
  | "error";

type TranscriptTurn =
  | { role: "agent" | "user"; content: string }
  | { role: "tool_call_invocation"; name: string; tool_call_id: string; arguments?: string }
  | { role: "tool_call_result"; tool_call_id: string }
  | { role: string; content?: string; name?: string; tool_call_id?: string };

// ─── Scenario data ─────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    id: "booking",
    label: "Book a grooming",
    emoji: "🐾",
    script: "Hi, I have a golden retriever who needs a full groom. Do you come to Pacific Beach?",
  },
  {
    id: "pricing",
    label: "Ask about pricing",
    emoji: "💰",
    script: "Hi, how much does a full grooming cost? I have a medium-sized labradoodle.",
  },
  {
    id: "mobile",
    label: "How it works",
    emoji: "🚐",
    script: "Hey, I heard you do mobile grooming — can you tell me how that works?",
  },
] as const;

type ScenarioId = (typeof SCENARIOS)[number]["id"];

// ─── AI tool → friendly label ──────────────────────────────────────────────

const TOOL_LABELS: Record<string, string | null> = {
  check_availability: "Checked availability",
  "check-availability": "Checked availability",
  book_appointment: "Booked appointment",
  "book-appointment": "Booked appointment",
  get_quote: "Looked up pricing",
  "get-quote": "Looked up pricing",
  get_services: "Looked up services",
  "get-services": "Looked up services",
  lookup_customer: "Recognized returning customer",
  "lookup-customer": "Recognized returning customer",
  lookup_customer_context: "Recognized returning customer",
  join_waitlist: "Added to waitlist",
  "join-waitlist": "Added to waitlist",
  cancel_appointment: "Cancelled appointment",
  reschedule_appointment: "Rescheduled appointment",
  add_call_note: "Noted for the groomer",
  business_faq: "Checked FAQ",
  current_datetime: null,
  get_current_datetime: null,
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

// ─── Transcript viewer ─────────────────────────────────────────────────────

function TranscriptViewer({ turns }: { turns: TranscriptTurn[] }) {
  const visible = turns.filter(
    (t) => t.role === "agent" || t.role === "user" || t.role === "tool_call_invocation"
  );

  if (visible.length === 0) {
    return (
      <p className="text-sm text-paw-brown/40 text-center py-4">No transcript available.</p>
    );
  }

  return (
    <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
      {visible.map((turn, i) => {
        if (turn.role === "tool_call_invocation") {
          const label = TOOL_LABELS[(turn as { role: "tool_call_invocation"; name: string }).name ?? ""] ?? null;
          if (!label) return null;
          return (
            <div
              key={i}
              className="flex items-center justify-center gap-2 py-1 animate-in fade-in duration-300"
              style={{ animationDelay: `${i * 40}ms` }}
            >
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold">
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                </svg>
                {label}
              </span>
            </div>
          );
        }

        const isAgent = turn.role === "agent";
        const content = (turn as { role: string; content?: string }).content ?? "";
        if (!content.trim()) return null;

        return (
          <div
            key={i}
            className={`flex gap-2 animate-in fade-in slide-in-from-bottom-1 duration-300 ${isAgent ? "justify-end" : "justify-start"}`}
            style={{ animationDelay: `${i * 40}ms` }}
          >
            {!isAgent && (
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-paw-sky border-2 border-paw-brown/10 flex items-center justify-center mt-0.5">
                <span className="text-xs">👤</span>
              </div>
            )}
            <div
              className={`max-w-[78%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                isAgent
                  ? "bg-paw-brown text-paw-cream rounded-br-sm"
                  : "bg-white border-2 border-paw-brown/8 text-paw-brown rounded-bl-sm"
              }`}
            >
              {content}
            </div>
            {isAgent && (
              <div className="flex-shrink-0 w-6 h-6 rounded-full bg-paw-brown flex items-center justify-center mt-0.5">
                <span className="text-xs">🐾</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

export function SpawklesDemoClient() {
  const [livePhase, setLivePhase] = useState<LivePhase>("loading");
  const [number, setNumber] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [transcriptObject, setTranscriptObject] = useState<TranscriptTurn[] | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>("booking");
  const [completedTab, setCompletedTab] = useState<"summary" | "transcript">("summary");

  // Countdown timer (4-minute demo cap)
  const DEMO_DURATION_S = 240;
  const [callStartedAt, setCallStartedAt] = useState<number | null>(null);
  const [timeLeft, setTimeLeft] = useState(DEMO_DURATION_S);

  const phaseRef = useRef<LivePhase>("loading");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const esRef = useRef<EventSource | null>(null);
  const startedRef = useRef(false);

  useEffect(() => { phaseRef.current = livePhase; }, [livePhase]);

  // Tick the countdown every second
  useEffect(() => {
    if (livePhase !== "in_progress" || !callStartedAt) return;
    const tick = () => {
      const elapsed = Math.floor((Date.now() - callStartedAt) / 1000);
      setTimeLeft(Math.max(0, DEMO_DURATION_S - elapsed));
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [livePhase, callStartedAt]);

  // On mount: check for saved session or start fresh
  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const saved = localStorage.getItem("spawklesDemoSession");
    if (saved) {
      try {
        const { token, number: num, startedAt } = JSON.parse(saved) as {
          token: string; number: string; startedAt: string;
        };
        const age = Date.now() - new Date(startedAt).getTime();
        if (age <= 30 * 60 * 1000) {
          setSessionToken(token);
          setNumber(num);
          fetch(`/api/demo/spawkles/status?token=${token}`, { cache: "no-store" })
            .then((r) => r.json())
            .then((data: { phase: string; summary: string | null; transcriptObject?: TranscriptTurn[] | null }) => {
              if (data.phase === "completed") {
                setSummary(data.summary);
                setTranscriptObject(data.transcriptObject ?? null);
                setLivePhase("completed");
              } else if (data.phase === "in_progress") {
                setLivePhase("in_progress");
                setCallStartedAt(Date.now());
                startSSE(token);
              } else {
                setLivePhase("waiting");
                startSSE(token);
              }
            })
            .catch(() => { startDemo(); });
          return;
        }
      } catch { /* ignore */ }
      localStorage.removeItem("spawklesDemoSession");
    }

    startDemo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSSE();
      stopPolling();
    };
  }, []);

  // ── Demo provisioning ────────────────────────────────────────────────────

  async function startDemo(opts?: { reset?: boolean }) {
    setLivePhase("loading");
    try {
      const res = await fetch("/api/demo/spawkles/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reset: !!opts?.reset }),
      });
      const data = await res.json() as {
        sessionToken?: string; number?: string; startedAt?: string;
        error?: string;
      };
      if (!res.ok || !data.number) { setLivePhase("error"); return; }

      const sToken = data.sessionToken!;
      const num = data.number;
      const startedAt = data.startedAt ?? new Date().toISOString();
      localStorage.setItem("spawklesDemoSession", JSON.stringify({ token: sToken, number: num, startedAt }));
      setSessionToken(sToken);
      setNumber(num);
      setLivePhase("waiting");
      startSSE(sToken);
    } catch {
      setLivePhase("error");
    }
  }

  // ── SSE (primary) ─────────────────────────────────────────────────────────

  function stopSSE() {
    if (esRef.current) { esRef.current.close(); esRef.current = null; }
  }

  function startSSE(token: string) {
    stopSSE();
    stopPolling();

    const es = new EventSource(`/api/demo/spawkles/stream?token=${encodeURIComponent(token)}`);
    esRef.current = es;

    es.onmessage = (e: MessageEvent<string>) => {
      try {
        const data = JSON.parse(e.data) as {
          phase: string;
          summary?: string | null;
          transcriptObject?: TranscriptTurn[] | null;
        };
        if (data.phase === "in_progress" && phaseRef.current === "waiting") {
          setLivePhase("in_progress");
          setCallStartedAt(Date.now());
        } else if (data.phase === "completed") {
          setSummary(data.summary ?? null);
          setTranscriptObject(data.transcriptObject ?? null);
          setLivePhase("completed");
          es.close();
          esRef.current = null;
        } else if (data.phase === "timeout") {
          es.close();
          esRef.current = null;
          if (phaseRef.current !== "completed") startSSE(token);
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      if (phaseRef.current !== "completed") startPolling(token);
    };
  }

  // ── Polling (SSE fallback) ────────────────────────────────────────────────

  function stopPolling() {
    if (pollRef.current) { clearInterval(pollRef.current); pollRef.current = null; }
  }

  function startPolling(token: string) {
    stopPolling();
    pollRef.current = setInterval(async () => {
      try {
        const res = await fetch(`/api/demo/spawkles/status?token=${token}`, { cache: "no-store" });
        const data = await res.json() as {
          phase: string;
          summary: string | null;
          transcriptObject?: TranscriptTurn[] | null;
        };
        if (data.phase === "in_progress" && phaseRef.current === "waiting") {
          setLivePhase("in_progress");
          setCallStartedAt(Date.now());
        } else if (data.phase === "completed") {
          setSummary(data.summary);
          setTranscriptObject(data.transcriptObject ?? null);
          setLivePhase("completed");
          stopPolling();
        }
      } catch { /* ignore */ }
    }, 3000);
  }

  function resetDemo() {
    stopSSE();
    stopPolling();
    localStorage.removeItem("spawklesDemoSession");
    setNumber("");
    setSummary(null);
    setTranscriptObject(null);
    setSessionToken(null);
    setSelectedScenario("booking");
    setCompletedTab("summary");
    // reset: true → server expires the old attempt and issues a fresh one with
    // a new startedAt so the status/stream endpoints don't match the prior call.
    startDemo({ reset: true });
  }

  const formattedNumber = number ? formatPhone(number) : "";
  const currentScenario = SCENARIOS.find((s) => s.id === selectedScenario) ?? SCENARIOS[0];

  return (
    <div className="min-h-screen bg-paw-sky antialiased flex flex-col relative">
      {/* Background blobs */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <svg className="absolute top-[-10%] left-[-5%] w-[500px] h-[500px] text-paw-amber opacity-60" viewBox="0 0 200 200" fill="currentColor">
          <ellipse cx="100" cy="130" rx="38" ry="32" />
          <ellipse cx="62" cy="82" rx="16" ry="20" transform="rotate(-10 62 82)" />
          <ellipse cx="138" cy="82" rx="16" ry="20" transform="rotate(10 138 82)" />
          <ellipse cx="82" cy="62" rx="14" ry="18" transform="rotate(-5 82 62)" />
          <ellipse cx="118" cy="62" rx="14" ry="18" transform="rotate(5 118 62)" />
        </svg>
        <svg className="absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] text-white opacity-50" viewBox="0 0 200 200" fill="currentColor">
          <ellipse cx="100" cy="130" rx="38" ry="32" />
          <ellipse cx="62" cy="82" rx="16" ry="20" transform="rotate(-10 62 82)" />
          <ellipse cx="138" cy="82" rx="16" ry="20" transform="rotate(10 138 82)" />
          <ellipse cx="82" cy="62" rx="14" ry="18" transform="rotate(-5 82 62)" />
          <ellipse cx="118" cy="62" rx="14" ry="18" transform="rotate(5 118 62)" />
        </svg>
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-center px-6 py-5 max-w-4xl mx-auto w-full">
        <BrandLogo mobileWidth={120} desktopWidth={140} priority />
      </nav>

      <main className="flex-1 flex flex-col items-center px-4 py-6 relative z-10 gap-6">
        {/* Intro heading — only when not in active call */}
        {livePhase === "loading" && (
          <div className="text-center mb-2">
            <h1 className="text-3xl sm:text-4xl font-extrabold text-paw-brown leading-tight mb-2">
              Hi Shirine!
            </h1>
            <p className="text-paw-brown/60 font-medium text-base max-w-md mx-auto leading-relaxed">
              We built Pip just for Spawkles. Call below to hear your phone receptionist in action.
            </p>
          </div>
        )}

        <div className="w-full max-w-xl">
          {/* Loading */}
          {livePhase === "loading" && (
            <div className="text-center animate-in fade-in duration-300 py-8">
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

          {/* Error */}
          {livePhase === "error" && (
            <div className="text-center animate-in fade-in duration-300 py-8">
              <p className="text-lg font-bold text-paw-brown mb-3">Something went wrong</p>
              <button
                onClick={resetDemo}
                className="px-6 py-3 bg-paw-brown text-paw-cream rounded-full font-bold text-sm hover:bg-opacity-90 transition-all shadow-soft"
              >
                Try again
              </button>
            </div>
          )}

          {/* Active demo — waiting / in_progress / completed */}
          {(livePhase === "waiting" || livePhase === "in_progress" || livePhase === "completed") && (
            <div className="bg-paw-cream rounded-[2rem] border-4 border-white shadow-soft p-5 sm:p-8 animate-in fade-in duration-300">
              <div className="text-center mb-6">
                {/* Hero heading for waiting state */}
                {livePhase === "waiting" && (
                  <div className="mb-6">
                    <h1 className="text-3xl sm:text-4xl font-extrabold text-paw-brown leading-tight mb-2">
                      Hi Shirine!
                    </h1>
                    <p className="text-paw-brown/60 font-medium text-base max-w-sm mx-auto">
                      Call Pip, your phone receptionist for Spawkles. 4-minute demo call.
                    </p>
                  </div>
                )}

                {/* Phone icon with animated rings */}
                <div className="relative inline-flex items-center justify-center w-28 h-28 mx-auto mb-4">
                  {livePhase === "waiting" && (
                    <>
                      <div className="absolute inset-0 rounded-full bg-paw-orange/20 animate-ping" style={{ animationDuration: "1.8s" }} />
                      <div className="absolute inset-3 rounded-full bg-paw-orange/15 animate-ping" style={{ animationDuration: "1.8s", animationDelay: "0.4s" }} />
                    </>
                  )}
                  {livePhase === "in_progress" && (
                    <>
                      <div className="absolute inset-0 rounded-full bg-amber-400/30 animate-ping" style={{ animationDuration: "1.2s" }} />
                      <div className="absolute inset-3 rounded-full bg-amber-400/20 animate-ping" style={{ animationDuration: "1.2s", animationDelay: "0.3s" }} />
                    </>
                  )}
                  {livePhase === "completed" && <div className="absolute inset-0 rounded-full bg-green-400/20" />}
                  <div className={`relative w-20 h-20 rounded-full flex items-center justify-center shadow-soft transition-colors duration-500 ${
                    livePhase === "completed" ? "bg-green-500" : livePhase === "in_progress" ? "bg-amber-500" : "bg-paw-brown"
                  }`}>
                    {livePhase === "completed" ? (
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                    ) : (
                      <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round">
                        <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                      </svg>
                    )}
                  </div>
                </div>

                {/* Phase-specific content */}
                {livePhase === "waiting" && (
                  <>
                    <p className="text-xs font-bold text-paw-brown/40 uppercase tracking-widest mb-2">Call this number now</p>
                    <a
                      href={`tel:${number}`}
                      className="block text-4xl sm:text-6xl font-extrabold text-paw-brown tracking-wide hover:text-paw-orange transition-colors"
                    >
                      {formattedNumber}
                    </a>
                    <p className="text-xs text-paw-brown/40 mt-2">Tap to dial on mobile · or enter manually</p>
                  </>
                )}
                {livePhase === "in_progress" && (
                  <div className="animate-in fade-in duration-300">
                    <p className="text-lg font-bold text-amber-600 mb-1">Pip is on the call!</p>
                    <p className="text-3xl font-extrabold text-amber-600 tabular-nums tracking-wide">
                      {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                    </p>
                    <p className="text-xs text-paw-brown/40 mt-1">remaining in demo</p>
                  </div>
                )}
                {livePhase === "completed" && (
                  <div className="animate-in fade-in duration-300">
                    <p className="text-xl font-extrabold text-green-700 mb-1">That was Pip!</p>
                    <p className="text-sm text-paw-brown/50">Natural, friendly, and ready to answer 24/7.</p>
                  </div>
                )}
              </div>

              {/* Scenario selector (waiting only) */}
              {livePhase === "waiting" && (
                <div className="mb-4">
                  <p className="text-xs font-bold text-paw-brown/40 uppercase tracking-wider mb-2 text-center">Pick a scenario to try</p>
                  <div className="grid grid-cols-3 gap-2">
                    {SCENARIOS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedScenario(s.id)}
                        className={`flex flex-col items-center gap-1 px-2 py-3 rounded-2xl border-2 text-center transition-all ${
                          selectedScenario === s.id
                            ? "border-paw-brown bg-paw-brown/5 shadow-soft"
                            : "border-paw-brown/10 bg-white hover:border-paw-brown/25"
                        }`}
                      >
                        <span className="text-xl">{s.emoji}</span>
                        <span className={`text-xs font-bold leading-tight ${selectedScenario === s.id ? "text-paw-brown" : "text-paw-brown/60"}`}>
                          {s.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Try saying (waiting only) */}
              {livePhase === "waiting" && (
                <div className="bg-paw-sky/70 rounded-2xl p-4 border border-paw-brown/8 mb-4 transition-all duration-300">
                  <p className="text-xs font-bold text-paw-brown/50 uppercase tracking-wider mb-2">Try saying →</p>
                  <p className="text-sm text-paw-brown/80 italic leading-relaxed">
                    &ldquo;{currentScenario.script}&rdquo;
                  </p>
                </div>
              )}

              {/* In progress indicator */}
              {livePhase === "in_progress" && (
                <div className="bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 text-center mb-4 animate-in fade-in duration-300">
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                    <span className="text-sm font-bold text-amber-700">Listening live</span>
                    <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                  </div>
                  <p className="text-xs text-amber-600/70 mt-1">Full transcript appears when the call ends.</p>
                </div>
              )}

              {/* Completed: tabs for summary + transcript */}
              {livePhase === "completed" && (
                <div className="mb-4 animate-in fade-in slide-in-from-bottom-3 duration-400">
                  {/* Tabs */}
                  <div className="flex gap-1 bg-paw-sky/60 rounded-2xl p-1 mb-3">
                    <button
                      onClick={() => setCompletedTab("summary")}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                        completedTab === "summary"
                          ? "bg-white shadow-soft text-paw-brown"
                          : "text-paw-brown/50 hover:text-paw-brown/80"
                      }`}
                    >
                      Summary
                    </button>
                    <button
                      onClick={() => setCompletedTab("transcript")}
                      className={`flex-1 py-2 rounded-xl text-xs font-bold transition-all ${
                        completedTab === "transcript"
                          ? "bg-white shadow-soft text-paw-brown"
                          : "text-paw-brown/50 hover:text-paw-brown/80"
                      }`}
                    >
                      Full Transcript
                      {transcriptObject && transcriptObject.length > 0 && (
                        <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-full bg-paw-orange/20 text-paw-orange text-[10px]">
                          ✓
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Summary tab */}
                  {completedTab === "summary" && (
                    <div className="bg-green-50 border-2 border-green-200 rounded-2xl p-4">
                      <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">Call Summary</p>
                      {summary ? (
                        <p className="text-sm text-paw-brown/80 leading-relaxed">{summary}</p>
                      ) : (
                        <p className="text-sm text-paw-brown/50 italic">
                          Summary generates a few seconds after the call ends — refresh if it&apos;s missing.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Transcript tab */}
                  {completedTab === "transcript" && (
                    <div className="bg-white border-2 border-paw-brown/8 rounded-2xl p-4">
                      <p className="text-xs font-bold text-paw-brown/40 uppercase tracking-wider mb-3">
                        Conversation · actions highlighted
                      </p>
                      {transcriptObject && transcriptObject.length > 0 ? (
                        <TranscriptViewer turns={transcriptObject} />
                      ) : (
                        <p className="text-sm text-paw-brown/40 text-center py-3 italic">
                          Transcript not captured for this call — it&apos;ll appear on your next demo.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Waiting footer */}
              {livePhase === "waiting" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-3 py-1 text-paw-brown/40 text-xs font-bold">
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-paw-brown/30 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-paw-brown/30 animate-bounce" style={{ animationDelay: "120ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-paw-brown/30 animate-bounce" style={{ animationDelay: "240ms" }} />
                    </span>
                    Waiting for your call
                  </div>
                  <div className="flex items-center justify-center gap-3 text-xs text-paw-brown/40 font-semibold">
                    <span>4-min demo call</span>
                    <span className="text-paw-brown/20">&middot;</span>
                    <span>Full transcript after</span>
                  </div>
                  <button
                    onClick={() => {
                      if (sessionToken) {
                        fetch(`/api/demo/spawkles/status?token=${sessionToken}`, { cache: "no-store" })
                          .then((r) => r.json())
                          .then((data: { phase: string; summary: string | null; transcriptObject?: TranscriptTurn[] | null }) => {
                            if (data.phase === "completed") {
                              setSummary(data.summary);
                              setTranscriptObject(data.transcriptObject ?? null);
                              setLivePhase("completed");
                              stopSSE();
                              stopPolling();
                            } else if (data.phase === "in_progress") {
                              setLivePhase("in_progress");
                              setCallStartedAt(Date.now());
                            }
                          })
                          .catch(() => { /* stay on waiting */ });
                      }
                    }}
                    className="w-full py-3 rounded-full border-2 border-paw-brown/10 text-paw-brown/50 text-sm font-bold hover:border-paw-brown/25 hover:text-paw-brown/70 transition-all"
                  >
                    I&apos;ve already called — check status
                  </button>
                </div>
              )}

              {/* Completed: try again + CTA */}
              {livePhase === "completed" && (
                <div className="mt-2 space-y-3 animate-in fade-in duration-400">
                  <button
                    onClick={resetDemo}
                    className="w-full py-3 rounded-full border-2 border-paw-brown/10 text-paw-brown/60 text-sm font-bold hover:border-paw-brown/25 hover:text-paw-brown transition-all"
                  >
                    Try another call
                  </button>
                  <div className="bg-paw-sky/60 rounded-2xl p-4 text-center">
                    <p className="text-sm font-bold text-paw-brown mb-1">Ready to get Pip answering your calls?</p>
                    <p className="text-xs text-paw-brown/50">
                      Reach out to us and we&apos;ll have Pip live for Spawkles in no time.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 pb-8 pt-4 flex flex-col items-center gap-2">
        <BrandLogo mobileWidth={100} desktopWidth={120} />
        <p className="text-xs text-paw-brown/30">
          Powered by RingPaw
        </p>
      </footer>
    </div>
  );
}
