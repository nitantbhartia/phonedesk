"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";
import { DemoCallPlayer } from "@/components/demo-call-player";

// ─── Types ────────────────────────────────────────────────────────────────────

type LivePhase =
  | "gate"         // qualification form
  | "sent"         // magic link sent, waiting for click
  | "loading"      // provisioning demo number
  | "waiting"      // number assigned, waiting for call
  | "in_progress"  // call in progress
  | "completed"    // call done
  | "cooldown"     // cooldown active
  | "unavailable"  // no demo numbers free
  | "error";

type GateError = "invalid_email" | "cooldown_active" | "other" | null;

type TranscriptTurn =
  | { role: "agent" | "user"; content: string }
  | { role: "tool_call_invocation"; name: string; tool_call_id: string; arguments?: string }
  | { role: "tool_call_result"; tool_call_id: string }
  | { role: string; content?: string; name?: string; tool_call_id?: string };

// ─── Scenario data ─────────────────────────────────────────────────────────

const SCENARIOS = [
  {
    id: "new_booking",
    label: "New client booking",
    emoji: "🐾",
    script: "Hi, I'm a new client — I have a golden retriever who needs a full groom. Do you have anything open next Thursday around 10am?",
  },
  {
    id: "reschedule",
    label: "Existing client reschedule",
    emoji: "📅",
    script: "Hey, I have an appointment booked for Saturday but something came up. Can I move it to next week?",
  },
  {
    id: "after_hours",
    label: "After-hours inquiry",
    emoji: "🌙",
    script: "Hi, I know it's late but I wanted to check — do you have any Saturday slots? My shih tzu is really overdue for a trim.",
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
  // skip noise
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
  // Filter out tool_call_result (verbose JSON noise) and unknown roles
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
                <span className="text-xs">🤖</span>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Inner component (uses useSearchParams) ───────────────────────────────────

function DemoPageInner() {
  const searchParams = useSearchParams();

  const [livePhase, setLivePhase] = useState<LivePhase>("gate");
  const [ldt, setLdt] = useState<string | null>(null);
  const [number, setNumber] = useState("");
  const [summary, setSummary] = useState<string | null>(null);
  const [transcriptObject, setTranscriptObject] = useState<TranscriptTurn[] | null>(null);
  const [sessionToken, setSessionToken] = useState<string | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<ScenarioId>("new_booking");
  const [completedTab, setCompletedTab] = useState<"summary" | "transcript">("summary");

  const [email, setEmail] = useState("");
  const [businessName, setBusinessName] = useState("");
  const [gateLoading, setGateLoading] = useState(false);
  const [gateError, setGateError] = useState<GateError>(null);
  const [gateErrorMsg, setGateErrorMsg] = useState("");

  const phaseRef = useRef<LivePhase>("gate");
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const esRef = useRef<EventSource | null>(null);

  useEffect(() => { phaseRef.current = livePhase; }, [livePhase]);

  // On mount: check for ?ldt= (magic link verified) or ?error=
  useEffect(() => {
    const ldtParam = searchParams.get("ldt");
    const errorParam = searchParams.get("error");

    if (errorParam) {
      if (errorParam === "token_expired") {
        setGateError("other");
        setGateErrorMsg("That link expired. Enter your email again and we'll send a new one.");
      } else if (errorParam === "token_used") {
        setGateError("other");
        setGateErrorMsg("That link was already used. Enter your email to get a new one.");
      } else {
        setGateError("other");
        setGateErrorMsg("Something went wrong with the link. Please try again.");
      }
      return;
    }

    if (ldtParam) {
      setLdt(ldtParam);
      // Check for a saved active session tied to this ldt
      const saved = localStorage.getItem("demoSession");
      if (saved) {
        try {
          const { token, number: num, startedAt, savedLdt } = JSON.parse(saved) as {
            token: string; number: string; startedAt: string; savedLdt?: string;
          };
          const age = Date.now() - new Date(startedAt).getTime();
          if (age <= 30 * 60 * 1000 && savedLdt === ldtParam) {
            setSessionToken(token);
            setNumber(num);
            fetch(`/api/demo/public/status?token=${token}`, { cache: "no-store" })
              .then((r) => r.json())
              .then((data: { phase: string; summary: string | null; transcriptObject?: TranscriptTurn[] | null }) => {
                if (data.phase === "completed") {
                  setSummary(data.summary);
                  setTranscriptObject(data.transcriptObject ?? null);
                  setLivePhase("completed");
                } else if (data.phase === "in_progress") {
                  setLivePhase("in_progress");
                  startSSE(token);
                } else {
                  setLivePhase("waiting");
                  startSSE(token);
                }
              })
              .catch(() => { setLivePhase("waiting"); startSSE(token); });
            return;
          }
        } catch { /* ignore */ }
      }
      setLivePhase("loading");
      startLiveDemo(ldtParam);
      return;
    }

    // Restore saved session without ldt param (tab reload after demo started)
    const saved = localStorage.getItem("demoSession");
    if (saved) {
      try {
        const { token, number: num, startedAt, savedLdt: sl } = JSON.parse(saved) as {
          token: string; number: string; startedAt: string; savedLdt?: string;
        };
        const age = Date.now() - new Date(startedAt).getTime();
        if (age <= 30 * 60 * 1000 && sl) {
          setLdt(sl);
          setSessionToken(token);
          setNumber(num);
          fetch(`/api/demo/public/status?token=${token}`, { cache: "no-store" })
            .then((r) => r.json())
            .then((data: { phase: string; summary: string | null; transcriptObject?: TranscriptTurn[] | null }) => {
              if (data.phase === "completed") {
                setSummary(data.summary);
                setTranscriptObject(data.transcriptObject ?? null);
                setLivePhase("completed");
              } else if (data.phase === "in_progress") {
                setLivePhase("in_progress");
                startSSE(token);
              } else {
                setLivePhase("waiting");
                startSSE(token);
              }
            })
            .catch(() => setLivePhase("gate"));
        } else {
          localStorage.removeItem("demoSession");
        }
      } catch { localStorage.removeItem("demoSession"); }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopSSE();
      stopPolling();
    };
  }, []);

  // ── Gate: submit qualification form ──────────────────────────────────────

  async function submitQualify(e: React.FormEvent) {
    e.preventDefault();
    setGateLoading(true);
    setGateError(null);
    setGateErrorMsg("");
    try {
      const res = await fetch("/api/demo/qualify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), businessName: businessName.trim() }),
      });
      const data = await res.json() as { sent?: boolean; error?: string; message?: string };
      if (res.ok && data.sent) { setLivePhase("sent"); return; }
      if (data.error === "invalid_email") {
        setGateError("invalid_email");
        setGateErrorMsg(data.message ?? "Please use a valid business email.");
      } else if (data.error === "cooldown_active") {
        setGateError("cooldown_active");
        setGateErrorMsg(data.message ?? "You've recently used the live demo.");
      } else {
        setGateError("other");
        setGateErrorMsg(data.message ?? "Something went wrong. Please try again.");
      }
    } catch {
      setGateError("other");
      setGateErrorMsg("Network error. Please try again.");
    } finally {
      setGateLoading(false);
    }
  }

  // ── Live demo provisioning ────────────────────────────────────────────────

  async function startLiveDemo(token: string) {
    setLivePhase("loading");
    try {
      const res = await fetch("/api/demo/public/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ldt: token }),
      });
      const data = await res.json() as {
        sessionToken?: string; number?: string; startedAt?: string;
        error?: string; message?: string; cooldownUntil?: string;
      };
      if (res.status === 401) {
        setLivePhase("gate");
        setGateError("other");
        setGateErrorMsg("Your session expired. Enter your email again for a new link.");
        return;
      }
      if (res.status === 429) {
        setLivePhase(data.error === "cooldown_active" ? "cooldown" : "error");
        return;
      }
      if (res.status === 503) {
        setLivePhase(data.error === "demo_unavailable" ? "unavailable" : "error");
        return;
      }
      if (!res.ok || !data.number) { setLivePhase("error"); return; }

      const sToken = data.sessionToken!;
      const num = data.number;
      const startedAt = data.startedAt ?? new Date().toISOString();
      localStorage.setItem("demoSession", JSON.stringify({ token: sToken, number: num, startedAt, savedLdt: token }));
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

    const es = new EventSource(`/api/demo/public/stream?token=${encodeURIComponent(token)}`);
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
        } else if (data.phase === "completed") {
          setSummary(data.summary ?? null);
          setTranscriptObject(data.transcriptObject ?? null);
          setLivePhase("completed");
          es.close();
          esRef.current = null;
        } else if (data.phase === "timeout") {
          // SSE timed out — reconnect silently
          es.close();
          esRef.current = null;
          if (phaseRef.current !== "completed") startSSE(token);
        }
      } catch { /* ignore parse errors */ }
    };

    es.onerror = () => {
      es.close();
      esRef.current = null;
      // Fallback to polling if SSE fails (e.g. proxy strips streaming)
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
        const res = await fetch(`/api/demo/public/status?token=${token}`, { cache: "no-store" });
        const data = await res.json() as {
          phase: string;
          summary: string | null;
          transcriptObject?: TranscriptTurn[] | null;
        };
        if (data.phase === "in_progress" && phaseRef.current === "waiting") setLivePhase("in_progress");
        else if (data.phase === "completed") {
          setSummary(data.summary);
          setTranscriptObject(data.transcriptObject ?? null);
          setLivePhase("completed");
          stopPolling();
        }
      } catch { /* ignore */ }
    }, 3000);
  }

  function resetToGate() {
    stopSSE();
    stopPolling();
    localStorage.removeItem("demoSession");
    setLivePhase("gate");
    setLdt(null);
    setNumber("");
    setSummary(null);
    setTranscriptObject(null);
    setSessionToken(null);
    setGateError(null);
    setGateErrorMsg("");
    setSelectedScenario("new_booking");
    setCompletedTab("summary");
    window.history.replaceState({}, "", "/demo");
  }

  const formattedNumber = number ? formatPhone(number) : "";
  const inActiveCall = livePhase === "waiting" || livePhase === "in_progress" || livePhase === "completed";
  const currentScenario = SCENARIOS.find((s) => s.id === selectedScenario) ?? SCENARIOS[0];

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

      <main className="flex-1 flex flex-col items-center px-4 py-10 relative z-10 gap-10">

        {/* ── Tier 1: Recorded sample — always visible unless on active live call ── */}
        {!inActiveCall && (
          <div className="w-full max-w-xl animate-in fade-in duration-300">
            <div className="text-center mb-6">
              <h1 className="text-4xl sm:text-5xl font-extrabold text-paw-brown leading-tight mb-3">
                Hear your AI receptionist.<br />
                <span className="text-paw-orange">No setup needed.</span>
              </h1>
              <p className="text-paw-brown/60 font-medium text-lg max-w-md mx-auto leading-relaxed">
                Listen to a real sample call, then try it live yourself.
              </p>
            </div>
            <div className="bg-paw-cream rounded-[2rem] border-4 border-white shadow-soft p-6 mb-2">
              <p className="text-xs font-bold text-paw-brown/40 uppercase tracking-widest mb-3 text-center">Sample call</p>
              <DemoCallPlayer audioSrc="/luna-call.wav" />
            </div>
          </div>
        )}

        {/* ── Tier 2: Live demo gate / active session ── */}
        <div className="w-full max-w-xl">

          {/* Gate — qualification form */}
          {livePhase === "gate" && (
            <div className="bg-paw-cream rounded-[2rem] border-4 border-white shadow-soft p-8 animate-in fade-in duration-300">
              <div className="text-center mb-6">
                <div className="inline-flex items-center gap-2 bg-paw-amber/20 border border-paw-amber/30 text-paw-brown text-xs font-bold px-4 py-1.5 rounded-full mb-4">
                  <span className="w-1.5 h-1.5 rounded-full bg-paw-orange animate-pulse" />
                  Live AI Demo
                </div>
                <h2 className="text-2xl font-extrabold text-paw-brown mb-2">Try it live</h2>
                <p className="text-paw-brown/60 text-sm font-medium">
                  Enter your business email to get a real number to call.
                </p>
              </div>
              <form onSubmit={submitQualify} className="space-y-3">
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@yourbusiness.com"
                  className="w-full px-4 py-3 rounded-2xl border-2 border-paw-brown/10 bg-white text-paw-brown font-medium text-sm placeholder:text-paw-brown/30 focus:outline-none focus:border-paw-brown/30 transition-colors"
                />
                <input
                  type="text"
                  value={businessName}
                  onChange={(e) => setBusinessName(e.target.value)}
                  placeholder="Business name (optional)"
                  className="w-full px-4 py-3 rounded-2xl border-2 border-paw-brown/10 bg-white text-paw-brown font-medium text-sm placeholder:text-paw-brown/30 focus:outline-none focus:border-paw-brown/30 transition-colors"
                />
                {gateError && (
                  <p className="text-sm text-red-600 font-medium px-1">{gateErrorMsg}</p>
                )}
                <button
                  type="submit"
                  disabled={gateLoading || !email}
                  className="w-full px-8 py-4 bg-paw-brown text-paw-cream rounded-full font-bold text-base hover:bg-opacity-90 transition-all shadow-soft disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                >
                  {gateLoading ? (
                    <>
                      <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                      </svg>
                      Sending link…
                    </>
                  ) : (
                    <>
                      Send me the demo link
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
                      </svg>
                    </>
                  )}
                </button>
                <p className="text-xs text-paw-brown/40 text-center">No signup · 1 live demo every 3 days</p>
              </form>
            </div>
          )}

          {/* Sent — waiting for magic link click */}
          {livePhase === "sent" && (
            <div className="bg-paw-cream rounded-[2rem] border-4 border-white shadow-soft p-10 text-center animate-in fade-in duration-300">
              <div className="text-5xl mb-4">📬</div>
              <h2 className="text-2xl font-extrabold text-paw-brown mb-3">Check your inbox</h2>
              <p className="text-paw-brown/60 font-medium mb-2 leading-relaxed">
                We sent a magic link to <strong className="text-paw-brown">{email}</strong>.
              </p>
              <p className="text-paw-brown/50 text-sm mb-8">Click it to launch your live demo. Expires in 1 hour.</p>
              <button
                onClick={() => { setLivePhase("gate"); setGateError(null); setGateErrorMsg(""); }}
                className="text-sm text-paw-brown/50 hover:text-paw-brown transition-colors"
              >
                Wrong email? Go back
              </button>
            </div>
          )}

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

          {/* Active demo — waiting / in_progress / completed */}
          {inActiveCall && (
            <div className="bg-paw-cream rounded-[2rem] border-4 border-white shadow-soft p-8 animate-in fade-in duration-300">
              <div className="text-center mb-6">
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

                {livePhase === "waiting" && (
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
                {livePhase === "in_progress" && (
                  <div className="animate-in fade-in duration-300">
                    <p className="text-lg font-bold text-amber-600 mb-1">Your AI is on the call!</p>
                    <p className="text-sm text-paw-brown/50">We&apos;ll show the full transcript when it ends.</p>
                  </div>
                )}
                {livePhase === "completed" && (
                  <div className="animate-in fade-in duration-300">
                    <p className="text-xl font-extrabold text-green-700 mb-1">🎉 That was your AI!</p>
                    <p className="text-sm text-paw-brown/50">Natural, fast, and ready to book 24/7.</p>
                  </div>
                )}
              </div>

              {/* ── Scenario selector (waiting only) ── */}
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

              {/* ── Try saying (waiting only) ── */}
              {livePhase === "waiting" && (
                <div className="bg-paw-sky/70 rounded-2xl p-4 border border-paw-brown/8 mb-4 transition-all duration-300">
                  <p className="text-xs font-bold text-paw-brown/50 uppercase tracking-wider mb-2">Try saying →</p>
                  <p className="text-sm text-paw-brown/80 italic leading-relaxed">
                    &ldquo;{currentScenario.script}&rdquo;
                  </p>
                </div>
              )}

              {/* ── In progress indicator ── */}
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

              {/* ── Completed: tabs for summary + transcript ── */}
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
                      <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">AI Call Summary</p>
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
                        Conversation · AI actions highlighted
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

              {/* ── Waiting footer ── */}
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
                  <button
                    onClick={() => { stopSSE(); stopPolling(); setLivePhase("completed"); }}
                    className="w-full py-3 rounded-full border-2 border-paw-brown/10 text-paw-brown/50 text-sm font-bold hover:border-paw-brown/25 hover:text-paw-brown/70 transition-all"
                  >
                    I&apos;ve already called ✓
                  </button>
                </div>
              )}

              {/* ── Completed CTA ── */}
              {livePhase === "completed" && (
                <div className="mt-2 space-y-3 animate-in fade-in duration-400">
                  <Link
                    href="/onboarding"
                    className="block w-full py-4 bg-paw-brown text-paw-cream rounded-full font-bold text-center text-lg hover:bg-opacity-90 transition-all shadow-soft"
                  >
                    Set this up for my shop →
                  </Link>
                  <p className="text-xs text-paw-brown/40 text-center">Card required · only charged after your first booking</p>
                  <button onClick={resetToGate} className="w-full py-2 text-xs text-paw-brown/40 hover:text-paw-brown/60 transition-colors">
                    Start over
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Cooldown */}
          {livePhase === "cooldown" && (
            <div className="bg-paw-cream rounded-[2rem] border-4 border-white shadow-soft p-10 text-center animate-in fade-in duration-300">
              <div className="text-4xl mb-4">⏳</div>
              <h2 className="text-2xl font-extrabold text-paw-brown mb-3">You&apos;ve already tried the live demo!</h2>
              <p className="text-paw-brown/60 font-medium mb-8 leading-relaxed">
                Live demos are limited to once every 3 days. Ready to set it up for your shop?
              </p>
              <Link
                href="/onboarding"
                className="block w-full py-4 bg-paw-brown text-paw-cream rounded-full font-bold text-lg hover:bg-opacity-90 transition-all shadow-soft mb-3"
              >
                Start my free trial →
              </Link>
              <Link href="/" className="text-sm text-paw-brown/50 hover:text-paw-brown transition-colors">Back to home</Link>
            </div>
          )}

          {/* Demo unavailable */}
          {livePhase === "unavailable" && (
            <div className="bg-paw-cream rounded-[2rem] border-4 border-white shadow-soft p-10 text-center animate-in fade-in duration-300">
              <div className="text-4xl mb-4">😅</div>
              <h2 className="text-2xl font-extrabold text-paw-brown mb-3">All demo lines are busy</h2>
              <p className="text-paw-brown/60 font-medium mb-8">
                Every line is in use right now. Try again in a minute, or just sign up — setup takes 5 minutes.
              </p>
              <div className="flex flex-col gap-3">
                <button
                  onClick={() => ldt && startLiveDemo(ldt)}
                  className="w-full py-4 bg-paw-brown text-paw-cream rounded-full font-bold text-lg hover:bg-opacity-90 transition-all shadow-soft"
                >
                  Try again
                </button>
                <Link href="/onboarding" className="block w-full py-3 rounded-full border-2 border-paw-brown/20 font-bold text-paw-brown text-center hover:bg-paw-sky transition-colors">
                  Sign up instead
                </Link>
              </div>
            </div>
          )}

          {/* Generic error */}
          {livePhase === "error" && (
            <div className="bg-paw-cream rounded-[2rem] border-4 border-white shadow-soft p-10 text-center animate-in fade-in duration-300">
              <div className="text-4xl mb-4">⚡</div>
              <h2 className="text-2xl font-extrabold text-paw-brown mb-3">Something went wrong</h2>
              <p className="text-paw-brown/60 font-medium mb-8">Couldn&apos;t start the demo. Please try again.</p>
              <button
                onClick={() => ldt ? startLiveDemo(ldt) : setLivePhase("gate")}
                className="w-full py-4 bg-paw-brown text-paw-cream rounded-full font-bold text-lg hover:bg-opacity-90 transition-all shadow-soft"
              >
                Try again
              </button>
            </div>
          )}

        </div>
      </main>

      <footer className="relative z-10 text-center py-6 text-xs text-paw-brown/40 font-medium">
        © {new Date().getFullYear()} RingPaw · <Link href="/" className="hover:text-paw-brown transition-colors">ringpaw.com</Link>
      </footer>
    </div>
  );
}

// Wrap in Suspense because useSearchParams requires it in Next.js App Router
export default function DemoPage() {
  return (
    <Suspense>
      <DemoPageInner />
    </Suspense>
  );
}
