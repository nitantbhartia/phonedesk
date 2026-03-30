"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { DashboardTour, shouldShowTour } from "@/components/dashboard-tour";

interface DashboardStats {
  callsThisWeek: number;
  callsLastWeek: number;
  callsThisMonth: number;
  bookingsConfirmed: number;
  bookingsMissed: number;
  revenueProtected: number;
  avgCallDuration: number;
  nextAppointment: {
    petName: string | null;
    serviceName: string | null;
    startTime: string;
    customerName: string | null;
  } | null;
}

interface RecentCall {
  id: string;
  callerName: string | null;
  callerPhone: string | null;
  status: string;
  duration: number | null;
  summary: string | null;
  transcript: string | null;
  createdAt: string;
  appointment?: {
    petName: string | null;
    serviceName: string | null;
    startTime: string;
    status: string;
  } | null;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((w) => w[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function getStatusBadge(call: RecentCall) {
  if (call.appointment) {
    return (
      <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
        Completed
      </span>
    );
  }
  if (call.status === "COMPLETED") {
    return (
      <span className="px-3 py-1 bg-paw-orange/10 text-paw-orange text-xs font-bold rounded-full">
        Follow-up Needed
      </span>
    );
  }
  return (
    <span className="px-3 py-1 bg-red-100 text-red-700 text-xs font-bold rounded-full">
      {call.status === "MISSED" ? "Missed" : call.status}
    </span>
  );
}

function getOutcome(call: RecentCall) {
  if (call.appointment) {
    const date = new Date(call.appointment.startTime).toLocaleDateString(
      "en-US",
      { month: "long", day: "numeric" }
    );
    return (
      <div className="flex items-center gap-2">
        <svg
          className="w-4 h-4 text-paw-orange"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          strokeWidth="3"
        >
          <path d="M20 6 9 17l-5-5" />
        </svg>
        <span className="text-sm font-medium">
          Booked for {date}
        </span>
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <svg
        className="w-4 h-4 text-paw-brown/40"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        strokeWidth="3"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="16" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12.01" y2="8" />
      </svg>
      <span className="text-sm font-medium text-paw-brown/60">
        {call.summary || "No summary available"}
      </span>
    </div>
  );
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats>({
    callsThisWeek: 0,
    callsLastWeek: 0,
    callsThisMonth: 0,
    bookingsConfirmed: 0,
    bookingsMissed: 0,
    revenueProtected: 0,
    avgCallDuration: 0,
    nextAppointment: null,
  });
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentLive, setAgentLive] = useState(true);
  const [agentToggling, setAgentToggling] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [subscribePromptOpen, setSubscribePromptOpen] = useState(false);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [onboardingComplete, setOnboardingComplete] = useState(true);
  const [justSubscribed, setJustSubscribed] = useState(false);
  const [transcriptCall, setTranscriptCall] = useState<RecentCall | null>(null);
  const [fetchError, setFetchError] = useState("");
  const [usageMinutesUsed, setUsageMinutesUsed] = useState(0);
  const [usageMinutesLimit, setUsageMinutesLimit] = useState(75);
  const [sendingDigest, setSendingDigest] = useState(false);
  const [digestSent, setDigestSent] = useState(false);
  const [digestError, setDigestError] = useState("");
  const [usagePlanName, setUsagePlanName] = useState("");
  const [tourOpen, setTourOpen] = useState(false);
  const [smsHintDismissed, setSmsHintDismissed] = useState(true); // default true to avoid flash

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") {
      fetchDashboardData();
      const params = new URLSearchParams(window.location.search);
      if (params.get("subscribed") === "true") setJustSubscribed(true);
      // Show tour automatically for first-time visitors
      if (shouldShowTour()) setTourOpen(true);
      // Show SMS hint banner until dismissed
      setSmsHintDismissed(localStorage.getItem("smsHintDismissed") === "1");
    }
  }, [status, router]);

  async function fetchDashboardData() {
    try {
      const [statsRes, callsRes, usageRes] = await Promise.all([
        fetch("/api/business/profile"),
        fetch("/api/calls?limit=10"),
        fetch("/api/billing/usage"),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        if (data.stats) setStats(data.stats);
        if (data.business?.retellConfig) {
          setAgentLive(data.business.retellConfig.isActive ?? true);
        }
        const subStatus = data.business?.stripeSubscriptionStatus;
        setSubscriptionActive(["active", "trialing"].includes(subStatus ?? ""));
        setOnboardingComplete(data.business?.onboardingComplete ?? true);
      }

      if (callsRes.ok) {
        const data = await callsRes.json();
        if (data.calls) setRecentCalls(data.calls);
      }

      if (usageRes.ok) {
        const data = await usageRes.json();
        setUsageMinutesUsed(data.minutesUsed ?? 0);
        setUsageMinutesLimit(data.minutesLimit ?? 75);
        setUsagePlanName(data.planName ?? "");
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
      setFetchError("Failed to load dashboard data. Please refresh the page.");
    } finally {
      setLoading(false);
    }
  }

  async function toggleAgent(enabled: boolean) {
    setAgentToggling(true);
    const prev = agentLive;
    setAgentLive(enabled);
    try {
      const res = await fetch("/api/business/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ agentActive: enabled }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setAgentLive(prev);
      setFetchError("Failed to update agent status. Please try again.");
    } finally {
      setAgentToggling(false);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-white/50 rounded-2xl animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
          {[1, 2, 3, 4].map((i) => (
            <div
              key={i}
              className="h-40 bg-white/50 rounded-[2rem] animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  const userName = session?.user?.name || "there";
  const firstName = userName.split(" ")[0];
  const avgServicePrice = stats.revenueProtected > 0 && stats.bookingsConfirmed > 0
    ? Math.round(stats.revenueProtected / stats.bookingsConfirmed)
    : 90;

  return (
    <div>
      <DashboardTour open={tourOpen} onClose={() => setTourOpen(false)} />

      {/* Error banner */}
      {fetchError && (
        <div className="mb-6 flex items-center gap-3 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <p className="flex-1 text-sm text-red-700 font-medium">{fetchError}</p>
          <button onClick={() => setFetchError("")} className="text-red-400 hover:text-red-600 transition-colors text-xs font-bold">Dismiss</button>
        </div>
      )}

      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-paw-brown">
            Welcome back, {firstName} 👋
          </h1>
          <p className="text-paw-brown/60 font-medium">
            Here&apos;s what RingPaw handled for you this week.{" "}
            <button
              onClick={() => setTourOpen(true)}
              className="text-paw-orange underline underline-offset-2 hover:text-paw-orange/80 text-sm font-semibold transition-colors"
            >
              Take a tour →
            </button>
          </p>
        </div>

        <div className="flex items-center gap-6">
          {/* Agent Status Toggle */}
          <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-full shadow-sm border border-paw-brown/5">
            <span className="text-sm font-bold text-paw-brown/70">
              Agent Status
            </span>
            <label className={`flex items-center ${subscriptionActive ? "cursor-pointer" : "cursor-not-allowed"}`}>
              <div className="relative" onClick={!subscriptionActive ? () => setSubscribePromptOpen(true) : undefined}>
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={subscriptionActive && agentLive}
                  disabled={agentToggling || !subscriptionActive}
                  onChange={(e) => {
                    if (!subscriptionActive) return;
                    if (!e.target.checked) {
                      setConfirmOff(true);
                    } else {
                      void toggleAgent(true);
                    }
                  }}
                />
                <div
                  className={`w-12 h-6 rounded-full shadow-inner transition-colors ${
                    subscriptionActive && agentLive ? "bg-paw-orange" : "bg-gray-200"
                  }`}
                />
                <div
                  className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform shadow-sm ${
                    subscriptionActive && agentLive ? "translate-x-6" : ""
                  }`}
                />
              </div>
              <div className="ml-3 text-paw-brown font-bold text-sm">
                {subscriptionActive && agentLive ? "Live" : "Off"}
              </div>
            </label>
          </div>

        </div>
      </header>

      {/* Just subscribed — welcome banner */}
      {justSubscribed && subscriptionActive && (
        <div className="mb-6 flex items-center gap-4 bg-green-50 border border-green-200 rounded-2xl px-5 py-4">
          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#16a34a" strokeWidth="2.5">
              <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><polyline points="22 4 12 14.01 9 11.01" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-bold text-green-800 text-sm">You&apos;re live! 🎉</p>
            <p className="text-green-700/70 text-sm">Your AI receptionist is now active and ready to answer calls.</p>
          </div>
          <button onClick={() => setJustSubscribed(false)} className="text-green-600 hover:text-green-800 text-lg font-bold">×</button>
        </div>
      )}

      {/* Agent-off banner — preview mode (still in onboarding) */}
      {!subscriptionActive && !onboardingComplete && (
        <div className="mb-6 flex items-center gap-4 bg-blue-50 border border-blue-200 rounded-2xl px-5 py-4">
          <div className="w-9 h-9 rounded-full bg-blue-100 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#2563eb" strokeWidth="2.5">
              <circle cx="12" cy="12" r="10" /><line x1="12" y1="16" x2="12" y2="12" /><line x1="12" y1="8" x2="12.01" y2="8" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-bold text-blue-800 text-sm">You&apos;re previewing your dashboard</p>
            <p className="text-blue-700/70 text-sm">This is what your calls and bookings will look like. Finish setup to go live.</p>
          </div>
          <Link href="/onboarding" className="shrink-0 px-4 py-2 bg-blue-600 text-white rounded-xl font-bold text-sm hover:bg-blue-700 transition-colors">
            Finish Setup
          </Link>
        </div>
      )}
      {/* SMS commands discovery banner — shown once until dismissed */}
      {!smsHintDismissed && (
        <div className="mb-6 flex items-start gap-4 bg-paw-sky/60 border border-paw-brown/10 rounded-2xl px-5 py-4">
          <div className="w-9 h-9 rounded-full bg-paw-brown/10 flex items-center justify-center shrink-0 mt-0.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-paw-brown">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-paw-brown text-sm">Manage RingPaw by text</p>
            <p className="text-paw-brown/60 text-sm mt-0.5">
              Text your RingPaw number to block time, pause bookings, or update services — no app needed.
              Try <code className="bg-white/60 px-1 py-0.5 rounded text-xs font-bold">&quot;Block tomorrow&quot;</code> or <code className="bg-white/60 px-1 py-0.5 rounded text-xs font-bold">&quot;Pause bookings&quot;</code>.{" "}
              <Link href="/settings/agent" className="underline underline-offset-2 hover:text-paw-brown transition-colors font-semibold">See all commands →</Link>
            </p>
          </div>
          <button
            onClick={() => { setSmsHintDismissed(true); localStorage.setItem("smsHintDismissed", "1"); }}
            className="text-paw-brown/40 hover:text-paw-brown transition-colors shrink-0 mt-0.5"
            aria-label="Dismiss"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {subscriptionActive && !agentLive && (
        <div className="mb-6 flex items-center gap-4 bg-red-50 border border-red-200 rounded-2xl px-5 py-4">
          <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center shrink-0">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
              <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
            </svg>
          </div>
          <div className="flex-1">
            <p className="font-bold text-red-700 text-sm">Your AI receptionist is off</p>
            <p className="text-red-600/70 text-sm">Calls are going to voicemail. Toggle the agent back on to resume.</p>
          </div>
          <button
            onClick={() => void toggleAgent(true)}
            className="shrink-0 px-4 py-2 bg-red-600 text-white rounded-xl font-bold text-sm hover:bg-red-700 transition-colors"
          >
            Turn back on
          </button>
        </div>
      )}

      {/* Confirmation dialog — turning agent off */}
      {confirmOff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center">
            <div className="w-14 h-14 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#dc2626" strokeWidth="2.5">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-paw-brown mb-2">Turn off RingPaw?</h3>
            <p className="text-paw-brown/60 text-sm mb-6">
              Calls will go to voicemail until you turn it back on. You might miss bookings while it&apos;s off.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOff(false)}
                className="flex-1 py-3 rounded-2xl border-2 border-paw-brown/10 font-bold text-paw-brown hover:bg-paw-sky transition-colors"
              >
                Keep it on
              </button>
              <button
                onClick={() => { setConfirmOff(false); void toggleAgent(false); }}
                className="flex-1 py-3 rounded-2xl bg-red-600 text-white font-bold hover:bg-red-700 transition-colors"
              >
                Turn off
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscribe prompt modal — shown when unsubscribed user tries to enable agent */}
      {subscribePromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setSubscribePromptOpen(false)}>
          <div className="bg-white rounded-3xl p-8 max-w-sm w-full shadow-2xl text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 bg-paw-amber/20 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-paw-brown mb-2">Subscription required</h3>
            <p className="text-paw-brown/60 text-sm mb-6">
              Your AI receptionist is ready to go — you just need an active plan to turn it on and start taking calls.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href="/settings/billing"
                onClick={() => setSubscribePromptOpen(false)}
                className="w-full py-3 bg-paw-brown text-paw-cream rounded-full font-bold hover:bg-opacity-90 transition-colors shadow-soft"
              >
                Choose a Plan
              </Link>
              <button
                onClick={() => setSubscribePromptOpen(false)}
                className="w-full py-3 rounded-full border-2 border-paw-brown/10 font-bold text-paw-brown hover:bg-paw-sky transition-colors"
              >
                Not now
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Transcript modal */}
      {transcriptCall && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setTranscriptCall(null)}>
          <div className="bg-white rounded-3xl p-8 max-w-lg w-full shadow-2xl max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-paw-brown">{transcriptCall.callerName || "Unknown Caller"}</h3>
                <p className="text-sm text-paw-brown/50">{new Date(transcriptCall.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
              <button onClick={() => setTranscriptCall(null)} className="text-paw-brown/40 hover:text-paw-brown transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-4">
              {getStatusBadge(transcriptCall)}
              {transcriptCall.appointment && (
                <div className="bg-green-50 rounded-2xl p-4 border border-green-100">
                  <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-1">Booking Confirmed</p>
                  <p className="font-bold text-green-900">{transcriptCall.appointment.petName} — {transcriptCall.appointment.serviceName}</p>
                  <p className="text-sm text-green-700">
                    {new Date(transcriptCall.appointment.startTime).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              )}
              <div className="bg-paw-sky/30 rounded-2xl p-4">
                <p className="text-xs font-bold text-paw-brown/50 uppercase tracking-wider mb-2">Call Summary</p>
                <p className="text-sm text-paw-brown leading-relaxed">{transcriptCall.summary || "No summary available for this call."}</p>
              </div>
              {transcriptCall.transcript && (
                <details className="group">
                  <summary className="flex items-center gap-2 cursor-pointer text-xs font-bold text-paw-brown/50 uppercase tracking-wider hover:text-paw-brown transition-colors">
                    <svg className="w-3 h-3 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="m9 18 6-6-6-6" /></svg>
                    Full Transcript
                  </summary>
                  <div className="mt-2 bg-white rounded-2xl border border-paw-brown/8 p-4 max-h-60 overflow-y-auto">
                    <p className="text-sm text-paw-brown/70 leading-relaxed whitespace-pre-wrap">{transcriptCall.transcript}</p>
                  </div>
                </details>
              )}
              {transcriptCall.duration && (
                <p className="text-xs text-paw-brown/40 text-right">Duration: {formatDuration(transcriptCall.duration)}</p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4 mb-6">
        {/* Calls Handled */}
        <div data-tour="tour-calls" className="bg-white p-4 rounded-2xl shadow-card border border-white/50">
          <div className="w-8 h-8 bg-paw-sky rounded-xl flex items-center justify-center text-paw-brown mb-3">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>
          <p className="text-xs font-bold text-paw-brown/50 uppercase tracking-wider">
            Calls Handled
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-paw-brown">
              {stats.callsThisWeek}
            </span>
            {stats.callsLastWeek > 0 && (() => {
              const pctChange = Math.round(((stats.callsThisWeek - stats.callsLastWeek) / stats.callsLastWeek) * 100);
              if (pctChange === 0) return null;
              return (
                <span className={`text-xs font-bold ${pctChange > 0 ? "text-green-500" : "text-red-400"}`}>
                  {pctChange > 0 ? "+" : ""}{pctChange}%
                </span>
              );
            })()}
          </div>
          <p className="text-xs text-paw-brown/40 mt-0.5">Past 7 days{stats.callsLastWeek > 0 ? ` · ${stats.callsLastWeek} last week` : ""}</p>
        </div>

        {/* Bookings */}
        <div className="bg-white p-4 rounded-2xl shadow-card border border-white/50">
          <div className="w-8 h-8 bg-paw-amber/20 rounded-xl flex items-center justify-center text-paw-brown mb-3">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <p className="text-xs font-bold text-paw-brown/50 uppercase tracking-wider">
            Bookings
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-paw-brown">
              {stats.bookingsConfirmed}
            </span>
            {stats.bookingsConfirmed + stats.bookingsMissed > 0 && (
              <span className="text-xs font-bold text-paw-orange">
                {Math.round((stats.bookingsConfirmed / (stats.bookingsConfirmed + stats.bookingsMissed)) * 100)}% rate
              </span>
            )}
          </div>
          <p className="text-xs text-paw-brown/40 mt-0.5">Past 30 days · {stats.bookingsMissed} missed</p>
          <div className="w-full bg-gray-100 h-1 rounded-full mt-2 flex overflow-hidden">
            <div
              className="bg-paw-orange h-full"
              style={{
                width:
                  stats.bookingsConfirmed + stats.bookingsMissed > 0
                    ? `${(stats.bookingsConfirmed / (stats.bookingsConfirmed + stats.bookingsMissed)) * 100}%`
                    : "0%",
              }}
            />
          </div>
        </div>

        {/* Revenue Protected */}
        <div data-tour="tour-revenue" className="bg-white p-4 rounded-2xl shadow-card border border-white/50">
          <div className="w-8 h-8 bg-paw-orange/10 rounded-xl flex items-center justify-center text-paw-orange mb-3">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <p className="text-xs font-bold text-paw-brown/50 uppercase tracking-wider">
            Est. Revenue Protected
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-extrabold text-paw-brown">
              ${stats.revenueProtected.toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-paw-brown/40 mt-0.5">
            Past 30 days · ${avgServicePrice} avg groom
          </p>
        </div>

        {/* Next Appointment */}
        <div className="bg-paw-brown p-4 rounded-2xl shadow-soft relative overflow-hidden group">
          <svg
            className="absolute -right-4 -bottom-4 w-24 h-24 text-white/5 opacity-10"
            fill="currentColor"
            viewBox="0 0 200 200"
          >
            <ellipse cx="100" cy="130" rx="38" ry="32" />
            <ellipse cx="62" cy="82" rx="16" ry="20" transform="rotate(-10 62 82)" />
            <ellipse cx="138" cy="82" rx="16" ry="20" transform="rotate(10 138 82)" />
            <ellipse cx="82" cy="62" rx="14" ry="18" transform="rotate(-5 82 62)" />
            <ellipse cx="118" cy="62" rx="14" ry="18" transform="rotate(5 118 62)" />
          </svg>
          <p className="text-xs font-bold text-paw-amber uppercase tracking-wider mb-2">
            Next Appointment
          </p>
          {stats.nextAppointment ? (
            <>
              <p className="text-xl font-bold text-white">
                {stats.nextAppointment.petName || stats.nextAppointment.customerName || "Upcoming"}
              </p>
              <p className="text-sm text-white/70">
                {new Date(stats.nextAppointment.startTime).toLocaleDateString("en-US", {
                  weekday: "long",
                  hour: "numeric",
                  minute: "2-digit",
                })}
              </p>
              {stats.nextAppointment.serviceName && (
                <p className="text-xs text-white/50 mt-0.5">{stats.nextAppointment.serviceName}</p>
              )}
            </>
          ) : (
            <>
              <p className="text-xl font-bold text-white">None scheduled</p>
              <p className="text-xs text-white/70">No upcoming appointments</p>
            </>
          )}
          <Link
            href="/today"
            className="mt-3 inline-block px-3 py-1.5 bg-white/10 hover:bg-white/20 transition-all rounded-xl text-xs font-bold text-white uppercase tracking-widest"
          >
            View Schedule
          </Link>
        </div>
      </div>

      {/* Minutes Usage Widget */}
      {subscriptionActive && usageMinutesLimit > 0 && (() => {
        const pct = Math.min((usageMinutesUsed / usageMinutesLimit) * 100, 100);
        const remaining = Math.max(0, usageMinutesLimit - usageMinutesUsed);
        const isNear = pct >= 80;
        return (
          <div className="bg-white rounded-2xl shadow-card border border-white/50 p-4 sm:p-5 mb-6">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs font-bold text-paw-brown/50 uppercase tracking-wider mb-1">
                  {usagePlanName} Plan — Monthly Minutes
                </p>
                <div className="flex items-baseline gap-2">
                  <span className="text-2xl font-extrabold text-paw-brown">{usageMinutesUsed}</span>
                  <span className="text-paw-brown/50 font-medium">/ {usageMinutesLimit} min used</span>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <span className={`text-sm font-bold ${isNear ? "text-amber-600" : "text-paw-brown/50"}`}>
                  {remaining} min remaining
                </span>
                {isNear && (
                  <Link
                    href="/settings/billing"
                    className="px-4 py-2 bg-paw-amber text-paw-brown text-sm font-bold rounded-full hover:bg-paw-brown hover:text-white transition-colors"
                  >
                    Upgrade
                  </Link>
                )}
              </div>
            </div>
            <div className="mt-3 w-full h-1.5 rounded-full bg-paw-brown/10 overflow-hidden">
              <div
                className={`h-full transition-all rounded-full ${isNear ? "bg-amber-400" : "bg-paw-amber"}`}
                style={{ width: `${pct}%` }}
              />
            </div>
          </div>
        );
      })()}

      {/* SMS Quick Commands card */}
      <div className="bg-white rounded-2xl shadow-card border border-white/50 px-5 py-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-paw-brown/50">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="text-xs font-bold text-paw-brown/50 uppercase tracking-wider">SMS Quick Commands</span>
          </div>
          <Link href="/settings/agent" className="text-xs font-bold text-paw-orange hover:underline">All commands →</Link>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-x-6 gap-y-1.5">
          {[
            { cmd: "Block tomorrow", desc: "Mark yourself unavailable all day" },
            { cmd: "Block Thu 2-4pm", desc: "Block a specific time slot" },
            { cmd: "Pause bookings", desc: "Switch to message-only mode" },
            { cmd: "Resume bookings", desc: "Turn booking back on" },
            { cmd: "Show today's schedule", desc: "See today's appointments" },
            { cmd: "Price list", desc: "View current services & pricing" },
          ].map((item) => (
            <div key={item.cmd} className="flex items-baseline gap-2 py-1">
              <code className="text-xs font-bold text-paw-brown shrink-0">&quot;{item.cmd}&quot;</code>
              <span className="text-xs text-paw-brown/45 truncate">— {item.desc}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Recent Call Log */}
      <div data-tour="tour-calllog" className="bg-white rounded-[2.5rem] shadow-card border border-white/50 overflow-hidden">
        <div className="px-8 py-6 border-b border-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-bold text-paw-brown">Recent Call Log</h2>
          <div className="flex gap-2">
            <button
              onClick={async () => {
                setSendingDigest(true);
                setDigestSent(false);
                setDigestError("");
                try {
                  const response = await fetch("/api/digest/weekly", {
                    method: "POST",
                  });
                  if (!response.ok) {
                    throw new Error("digest_failed");
                  }
                  setDigestSent(true);
                  setTimeout(() => setDigestSent(false), 4000);
                } catch {
                  setDigestError("Couldn’t send recap. Please try again.");
                } finally {
                  setSendingDigest(false);
                }
              }}
              disabled={sendingDigest}
              className="px-4 py-2 rounded-full border border-gray-100 text-sm font-bold hover:bg-paw-sky transition-colors disabled:opacity-50 flex items-center gap-2"
              title="Email yourself a weekly summary"
            >
              {digestSent ? (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="20 6 9 17 4 12"/></svg> Sent!</>
              ) : sendingDigest ? (
                <><svg className="animate-spin" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg> Sending…</>
              ) : (
                <><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="m22 3-10 9L2 3"/></svg> Weekly Recap</>
              )}
            </button>
            <Link
              href="/calls"
              className="px-4 py-2 rounded-full border border-gray-100 text-sm font-bold hover:bg-paw-sky transition-colors"
            >
              View All & Filter
            </Link>
          </div>
        </div>
        {digestError && (
          <div className="px-8 pb-4">
            <p className="text-sm font-medium text-red-600">{digestError}</p>
          </div>
        )}

        <div className="overflow-x-auto">
          {recentCalls.length === 0 ? (
            <div className="text-center py-16 text-paw-brown/50">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="mx-auto mb-4 opacity-50"
              >
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
              <p className="font-bold text-paw-brown">No calls yet</p>
              <p className="text-sm mt-1 mb-4">
                Make a test call to your RingPaw number to see it in action.
              </p>
              <Link
                href="/settings/agent"
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-paw-brown text-paw-cream rounded-full font-bold text-sm hover:bg-opacity-90 transition-all shadow-soft"
              >
                View your number
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M5 12h14" /><path d="m12 5 7 7-7 7" /></svg>
              </Link>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs font-bold text-paw-brown/40 uppercase tracking-widest border-b border-gray-50 bg-paw-cream/30">
                  <th className="px-4 sm:px-8 py-4">Caller</th>
                  <th className="px-4 sm:px-8 py-4 hidden sm:table-cell">Status</th>
                  <th className="px-4 sm:px-8 py-4 hidden md:table-cell">Outcome</th>
                  <th className="px-4 sm:px-8 py-4 hidden sm:table-cell">Duration</th>
                  <th className="px-4 sm:px-8 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentCalls.map((call) => {
                  const displayName =
                    call.callerName || call.callerPhone || "Unknown";
                  const initials = call.callerName
                    ? getInitials(call.callerName)
                    : "?";
                  const bgColors = [
                    "bg-paw-sky",
                    "bg-paw-amber/30",
                    "bg-paw-brown/10",
                    "bg-paw-orange/10",
                  ];
                  const bgColor =
                    bgColors[
                      displayName.charCodeAt(0) % bgColors.length
                    ];

                  return (
                    <tr
                      key={call.id}
                      className="hover:bg-paw-sky/10 transition-colors"
                    >
                      <td className="px-4 sm:px-8 py-4 sm:py-5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-full ${bgColor} flex items-center justify-center font-bold text-paw-brown shrink-0`}
                          >
                            {initials}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-bold text-paw-brown truncate">
                              {call.callerName || "Unknown Caller"}
                            </p>
                            <p className="text-xs text-paw-brown/50 truncate">
                              {call.callerPhone || "No number"}
                            </p>
                            <div className="sm:hidden mt-1">{getStatusBadge(call)}</div>
                          </div>
                        </div>
                      </td>
                      <td className="px-4 sm:px-8 py-4 sm:py-5 hidden sm:table-cell">{getStatusBadge(call)}</td>
                      <td className="px-4 sm:px-8 py-4 sm:py-5 hidden md:table-cell">{getOutcome(call)}</td>
                      <td className="px-4 sm:px-8 py-4 sm:py-5 text-sm text-paw-brown/60 hidden sm:table-cell">
                        {call.duration
                          ? formatDuration(call.duration)
                          : "--"}
                      </td>
                      <td className="px-4 sm:px-8 py-4 sm:py-5 text-right">
                        <button
                          onClick={() => setTranscriptCall(call)}
                          className="inline-flex items-center gap-2 text-paw-brown font-bold text-sm hover:text-paw-orange transition-colors"
                        >
                          View Summary
                          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z" />
                            <circle cx="12" cy="12" r="3" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>

        {recentCalls.length > 0 && (
          <div className="px-8 py-6 bg-paw-cream/20 text-center">
            <Link
              href="/calls"
              className="text-paw-brown font-bold hover:text-paw-orange transition-colors"
            >
              View All Call History
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
