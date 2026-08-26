"use client";

import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import Link from "next/link";

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
    emoji: "",
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
      <p className="text-sm text-muted text-center py-4">No transcript available.</p>
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
              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-sm bg-paper border border-line text-ink text-xs font-semibold">
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
              <div className="flex-shrink-0 w-6 h-6 rounded-sm bg-paper border-2 border-line flex items-center justify-center mt-0.5">
                <span className="font-mono text-[10px] text-muted">You</span>
              </div>
            )}
            <div
              className={`max-w-[78%] px-3 py-2 rounded-sm text-sm leading-relaxed ${
                isAgent
                ? "bg-ink text-surface rounded-br-sm"
                : "bg-surface border-2 border-line text-ink rounded-bl-sm"
              }`}
            >
              {content}
            </div>
            {isAgent && (
              <div className="flex-shrink-0 w-6 h-6 rounded-sm bg-ink flex items-center justify-center mt-0.5">
                <span className="font-mono text-[10px] text-surface">CS</span>
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
    <div className="studio-demo min-h-screen bg-paper antialiased flex flex-col relative">
      <header className="studio-header">
        <nav className="studio-nav mx-auto flex max-w-[1280px] items-center justify-between px-6 py-4 sm:px-10 lg:px-12">
          <BrandLogo mobileWidth={120} desktopWidth={140} priority />
          <div className="flex items-center gap-4">
            <Link href="/" className="hidden text-xs font-semibold text-muted transition-colors hover:text-ink sm:inline">
              Back to RingPaw
            </Link>
            <Link href="/onboarding" className="studio-button studio-button-small">
              Set up your shop <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </nav>
      </header>

      <main className="studio-demo-main flex-1 relative z-10">
        {/* Intro heading — only when not in active call */}
        {livePhase === "loading" && (
          <div className="studio-demo-hero mx-auto w-full max-w-[760px] px-6 py-12 text-center sm:px-10 sm:py-16">
            <p className="studio-eyebrow mb-6 justify-center"><span className="studio-eyebrow-line" />A RingPaw demo for Spawkles</p>
            <h1 className="font-display text-5xl font-bold leading-[0.92] tracking-[-0.06em] text-ink sm:text-7xl">
              Hear a missed call <span className="text-accent">become a booking.</span>
            </h1>
            <p className="mx-auto mt-7 max-w-[520px] text-[17px] font-medium leading-[1.6] text-muted sm:text-lg">
              Call the Spawkles demo line below and hear how RingPaw keeps a pet parent moving while the groomer keeps working.
            </p>
            <div className="studio-demo-meta mt-8 justify-center">
              <span><i /> Spawkles Mobile Dog Grooming</span>
              <span><i /> About 4 minutes</span>
              <span><i /> No signup required</span>
            </div>
          </div>
        )}

        <section id="live-demo" className="studio-demo-live-section scroll-mt-4">
          {/* Loading */}
          {livePhase === "loading" && (
            <div className="studio-demo-loading text-center animate-in fade-in duration-300">
              <div className="studio-demo-loading-icon">
                <svg className="animate-spin w-8 h-8 text-muted" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                </svg>
              </div>
              <p className="text-2xl font-bold text-ink mb-2">Setting up your live demo line</p>
              <p className="text-muted font-medium text-sm">One moment—we&apos;re finding an open number for you.</p>
            </div>
          )}

          {/* Error */}
          {livePhase === "error" && (
            <div className="studio-demo-state-card animate-in fade-in duration-300">
              <p className="studio-demo-label mb-4">Spawkles live demo</p>
              <h2 className="text-3xl font-bold leading-tight tracking-[-0.04em] text-ink mb-3">The live line couldn&apos;t be reserved</h2>
              <p className="text-muted font-medium mb-8 leading-relaxed">Try once more while we find an open demo line for Spawkles.</p>
              <button
                onClick={resetDemo}
                className="w-full py-4 bg-ink text-surface rounded-sm font-medium text-lg hover:bg-opacity-90 transition-all"
              >
                Try again
              </button>
            </div>
          )}

          {/* Active demo — waiting / in_progress / completed */}
          {(livePhase === "waiting" || livePhase === "in_progress" || livePhase === "completed") && (
            <div className="studio-demo-live-card animate-in fade-in duration-300">
              <div className="text-center mb-6">
                {/* Hero heading for waiting state */}
                {livePhase === "waiting" && (
                  <div className="mb-6">
                    <p className="studio-demo-label mb-4">Spawkles Mobile Dog Grooming</p>
                    <h1 className="text-3xl sm:text-4xl font-bold text-ink leading-tight tracking-[-0.04em] mb-2">
                      Hear RingPaw book a groom
                    </h1>
                    <p className="text-muted font-medium text-base max-w-sm mx-auto">
                      Call the number below and ask for a grooming appointment. RingPaw will take it from there.
                    </p>
                  </div>
                )}

                <div className="relative inline-flex items-center justify-center w-20 h-20 mx-auto mb-4">
                  <div className="relative w-20 h-20 rounded-sm flex items-center justify-center bg-ink">
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
                    <p className="studio-demo-label mb-2">Your live demo line</p>
                    <a
                      href={`tel:${number}`}
                      className="block text-4xl sm:text-6xl font-medium text-ink tracking-wide hover:text-accent transition-colors"
                    >
                      {formattedNumber}
                    </a>
                    <p className="text-xs text-muted mt-2">Tap to call on mobile, or dial it from another phone</p>
                  </>
                )}
                {livePhase === "in_progress" && (
                  <div className="animate-in fade-in duration-300">
                    <p className="text-lg font-bold text-ink mb-1">RingPaw is on the call!</p>
                    <p className="text-3xl font-medium text-ink tabular-nums tracking-wide">
                      {Math.floor(timeLeft / 60)}:{String(timeLeft % 60).padStart(2, "0")}
                    </p>
                    <p className="text-xs text-muted mt-1">remaining in demo</p>
                  </div>
                )}
                {livePhase === "completed" && (
                  <div className="animate-in fade-in duration-300">
                    <p className="text-xl font-medium text-ink mb-1">That was RingPaw!</p>
                    <p className="text-sm text-muted">Natural, friendly, and ready to answer 24/7.</p>
                  </div>
                )}
              </div>

              {/* Scenario selector (waiting only) */}
              {livePhase === "waiting" && (
                <div className="studio-demo-scenarios mb-5">
                  <p className="studio-demo-label mb-3 text-center">Choose what to ask for</p>
                  <div className="grid grid-cols-3 gap-2">
                    {SCENARIOS.map((s) => (
                      <button
                        key={s.id}
                        onClick={() => setSelectedScenario(s.id)}
                        className={`studio-demo-scenario flex flex-col items-center gap-1 px-2 py-3 rounded-sm border-2 text-center transition-all ${
                          selectedScenario === s.id
                          ? "border-ink bg-ink/5 "
                          : "border-line bg-surface hover:border-ink/25"
                        }`}
                      >
                        <span className={`text-xs font-bold leading-tight ${selectedScenario === s.id ? "text-ink" : "text-muted"}`}>
                          {s.label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Try saying (waiting only) */}
              {livePhase === "waiting" && (
                <div className="studio-demo-prompt bg-paper/70 rounded-sm p-4 border border-line mb-5 transition-all duration-300">
                  <p className="studio-demo-label mb-2">Try saying</p>
                  <p className="text-sm text-ink/80 italic leading-relaxed">
                    &ldquo;{currentScenario.script}&rdquo;
                  </p>
                </div>
              )}

              {/* In progress indicator */}
              {livePhase === "in_progress" && (
                <div className="bg-paper border-2 border-line rounded-sm p-4 text-center mb-4 animate-in fade-in duration-300">
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-ink animate-pulse" />
                    <span className="text-sm font-bold text-ink">Listening live</span>
                    <span className="w-2 h-2 rounded-full bg-ink animate-pulse" />
                  </div>
                  <p className="text-xs text-ink/70 mt-1">Full transcript appears when the call ends.</p>
                </div>
              )}

              {/* Completed: tabs for summary + transcript */}
              {livePhase === "completed" && (
                <div className="mb-4 animate-in fade-in slide-in-from-bottom-3 duration-400">
                  {/* Tabs */}
                  <div className="flex gap-1 bg-paper rounded-sm p-1 mb-3">
                    <button
                      onClick={() => setCompletedTab("summary")}
                      className={`flex-1 py-2 rounded-sm text-xs font-bold transition-all ${
                        completedTab === "summary"
                        ? "bg-surface text-ink"
                        : "text-muted hover:text-ink/80"
                      }`}
                    >
                      Summary
                    </button>
                    <button
                      onClick={() => setCompletedTab("transcript")}
                      className={`flex-1 py-2 rounded-sm text-xs font-bold transition-all ${
                        completedTab === "transcript"
                        ? "bg-surface text-ink"
                        : "text-muted hover:text-ink/80"
                      }`}
                    >
                      Full Transcript
                      {transcriptObject && transcriptObject.length > 0 && (
                        <span className="ml-1 inline-flex items-center justify-center w-4 h-4 rounded-sm bg-accent/10 text-accent text-[10px]">
                          ✓
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Summary tab */}
                  {completedTab === "summary" && (
                    <div className="bg-paper border-2 border-line rounded-sm p-4">
                      <p className="text-xs font-bold text-ink uppercase tracking-wider mb-2">Call Summary</p>
                      {summary ? (
                        <p className="text-sm text-ink/80 leading-relaxed">{summary}</p>
                      ) : (
                        <p className="text-sm text-muted italic">
                          Summary generates a few seconds after the call ends — refresh if it&apos;s missing.
                        </p>
                      )}
                    </div>
                  )}

                  {/* Transcript tab */}
                  {completedTab === "transcript" && (
                    <div className="bg-surface border-2 border-line rounded-sm p-4">
                      <p className="text-xs font-bold text-muted uppercase tracking-wider mb-3">
                        Conversation · actions highlighted
                      </p>
                      {transcriptObject && transcriptObject.length > 0 ? (
                        <TranscriptViewer turns={transcriptObject} />
                      ) : (
                        <p className="text-sm text-muted text-center py-3 italic">
                          Transcript not captured for this call — it&apos;ll appear on your next demo.
                        </p>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Waiting footer */}
              {livePhase === "waiting" && (
                <div className="studio-demo-waiting-footer space-y-3">
                  <div className="flex items-center justify-center gap-3 py-1 text-muted text-xs font-bold">
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-ink/30 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-ink/30 animate-bounce" style={{ animationDelay: "120ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-ink/30 animate-bounce" style={{ animationDelay: "240ms" }} />
                    </span>
                    Waiting for your call
                  </div>
                  <div className="flex items-center justify-center gap-3 text-xs text-muted font-semibold">
                    <span>4-min demo call</span>
                    <span className="text-ink/20">&middot;</span>
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
                    className="w-full py-3 rounded-sm border-2 border-line text-muted text-sm font-bold hover:border-ink/25 hover:text-muted transition-all"
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
                    className="w-full py-3 rounded-sm border-2 border-line text-muted text-sm font-bold hover:border-ink/25 hover:text-ink transition-all"
                  >
                    Try another call
                  </button>
                  <div className="bg-paper rounded-sm p-4 text-center">
                    <p className="text-sm font-bold text-ink mb-1">Ready to get RingPaw answering your calls?</p>
                    <p className="text-xs text-muted">
                      Reach out to us and we&apos;ll have RingPaw live for Spawkles in no time.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

        <section className="studio-demo-bottom mx-auto max-w-[1280px] px-6 pb-8 sm:px-10 lg:px-12">
          <div className="studio-demo-bottom-card">
            <p className="studio-eyebrow studio-eyebrow-light mb-4"><span className="studio-eyebrow-line" />Ready to go live?</p>
            <h2 className="max-w-[680px] font-display text-4xl font-bold leading-[0.95] tracking-[-0.055em] text-paper sm:text-6xl">
              Turn the next missed call into a booking.
            </h2>
            <p className="mt-5 max-w-[450px] text-[16px] leading-[1.6] text-paper/70">
              RingPaw gives independent grooming shops a calm, reliable way to keep booking while their hands are full.
            </p>
            <Link href="/onboarding" className="studio-button studio-button-light mt-8 inline-flex">
              Set up your shop <span aria-hidden="true">↗</span>
            </Link>
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="relative z-10 mx-auto flex w-full max-w-[1280px] items-center justify-between px-6 pb-8 pt-4 text-xs text-muted sm:px-10 lg:px-12">
        <span>© 2026 RingPaw</span>
        <span className="font-mono tracking-[0.14em]">RINGPAW.COM</span>
      </footer>
    </div>
  );
}
