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
  bookingAttempts: number;
  callbacks: number;
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

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function getStatusLabel(call: RecentCall) {
  if (call.appointment) return "Booked";
  if (call.status === "COMPLETED") return "Follow-up";
  return call.status === "MISSED" ? "Missed" : call.status;
}

function getOutcome(call: RecentCall) {
  if (call.appointment) {
    const date = new Date(call.appointment.startTime).toLocaleDateString(
      "en-US",
      { month: "long", day: "numeric" }
    );
    return <span className="text-[13px] text-ink">Booked for {date}</span>;
  }
  return (
    <span className="text-[13px] text-muted">
      {call.summary || "No summary"}
    </span>
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
    bookingAttempts: 0,
    callbacks: 0,
    revenueProtected: 0,
    avgCallDuration: 0,
    nextAppointment: null,
  });
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [lineLive, setLineLive] = useState(true);
  const [lineToggling, setLineToggling] = useState(false);
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
  const [funnelDropoff, setFunnelDropoff] = useState<
    Array<{ event: string; count: number; dropoffPct: number }>
  >([]);
  const [calendarHealth, setCalendarHealth] = useState<{
    connected: boolean;
    canReadBusy: boolean;
    canWriteEvents: boolean;
    message: string;
  } | null>(null);
  const [smsHintDismissed, setSmsHintDismissed] = useState(true); // default true to avoid flash

  useEffect(() => {
    const preview =
      process.env.NODE_ENV === "development" &&
      new URLSearchParams(window.location.search).get("preview") === "1";

    if (status === "unauthenticated" && !preview) {
      router.push("/");
      return;
    }
    if (status === "unauthenticated" && preview) {
      setLoading(false);
      return;
    }
    if (status === "authenticated") {
      fetchDashboardData();
      const params = new URLSearchParams(window.location.search);
      if (params.get("subscribed") === "true") setJustSubscribed(true);
      if (shouldShowTour()) setTourOpen(true);
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
        setLineLive(data.business?.isActive ?? true);
        const subStatus = data.business?.stripeSubscriptionStatus;
        setSubscriptionActive(["active", "trialing"].includes(subStatus ?? ""));
        setOnboardingComplete(data.business?.onboardingComplete ?? true);
        if (data.funnel?.dropoff) setFunnelDropoff(data.funnel.dropoff);
        if (data.calendarHealth) setCalendarHealth(data.calendarHealth);
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

  async function toggleLine(enabled: boolean) {
    setLineToggling(true);
    const prev = lineLive;
    setLineLive(enabled);
    try {
      const res = await fetch("/api/business/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: enabled }),
      });
      if (!res.ok) throw new Error();
    } catch {
      setLineLive(prev);
      setFetchError("Failed to update line status. Please try again.");
    } finally {
      setLineToggling(false);
    }
  }

  if (status === "loading" || loading) {
    return (
      <div className="space-y-8">
        <div className="h-8 w-40 bg-line/60" />
        <div className="h-px bg-line" />
        <div className="h-16 bg-line/40" />
      </div>
    );
  }

  const todayLabel = new Intl.DateTimeFormat("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(new Date());

  return (
    <div>
      <DashboardTour open={tourOpen} onClose={() => setTourOpen(false)} />

      {fetchError && (
        <div className="mb-6 flex items-baseline justify-between gap-4 border-b border-line pb-3">
          <p className="text-[13px] text-accent">{fetchError}</p>
          <button onClick={() => setFetchError("")} className="text-[12px] text-muted hover:text-ink">Dismiss</button>
        </div>
      )}

      <header className="mb-10 flex flex-col gap-5 border-b border-line pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="mb-3 font-mono text-[10px] uppercase tracking-[0.2em] text-muted">{todayLabel}</p>
          <h1 className="font-display text-[3rem] leading-none tracking-tight text-ink">Daybook</h1>
          <p className="mt-2 text-[14px] text-muted">
            Calls, openings, and what followed.
          </p>
        </div>
        <p className="font-mono text-[11px] uppercase tracking-[0.16em] text-muted">
          {lineLive ? "Line live" : "Line paused"}
        </p>
      </header>

      {justSubscribed && subscriptionActive && (
        <div className="mb-8 flex items-baseline justify-between gap-4 border-b border-line pb-4">
          <p className="text-[14px] text-ink">You&apos;re live. Forward unanswered calls to your Call Slot number.</p>
          <button onClick={() => setJustSubscribed(false)} className="text-[12px] text-muted hover:text-ink">Dismiss</button>
        </div>
      )}

      {!subscriptionActive && !onboardingComplete && (
        <div className="mb-8 flex items-baseline justify-between gap-4 border-b border-line pb-4">
          <p className="text-[14px] text-muted">Preview only. Finish setup to go live.</p>
          <Link href="/onboarding" className="text-[12px] tracking-[0.04em] text-accent hover:text-accent-hover">
            Finish setup
          </Link>
        </div>
      )}
      {/* SMS commands discovery banner — shown once until dismissed */}
      {false && !smsHintDismissed && (
        <div className="mb-6 flex items-start gap-4 bg-paper border border-line rounded-sm px-5 py-4">
          <div className="w-9 h-9 rounded-sm bg-ink/5 flex items-center justify-center shrink-0 mt-0.5">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-ink">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-bold text-ink text-sm">Manage Call Slot by text</p>
            <p className="text-muted text-sm mt-0.5">
              Text your Call Slot number to block time, pause bookings, or update services — no app needed.
              Try <code className="bg-white/60 px-1 py-0.5 rounded text-xs font-bold">&quot;Block tomorrow&quot;</code> or <code className="bg-white/60 px-1 py-0.5 rounded text-xs font-bold">&quot;Pause bookings&quot;</code>.{" "}
              <Link href="/settings/agent" className="underline underline-offset-2 hover:text-ink transition-colors font-semibold">See all commands →</Link>
            </p>
          </div>
          <button
            onClick={() => { setSmsHintDismissed(true); localStorage.setItem("smsHintDismissed", "1"); }}
            className="text-muted hover:text-ink transition-colors shrink-0 mt-0.5"
            aria-label="Dismiss"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M18 6 6 18M6 6l12 12" /></svg>
          </button>
        </div>
      )}

      {subscriptionActive && !lineLive && (
        <div className="mb-8 flex items-baseline justify-between gap-4 border-b border-line pb-4">
          <p className="text-[14px] text-accent">Call Slot is paused. Forwarded calls will not be answered.</p>
          <button
            onClick={() => void toggleLine(true)}
            className="text-[12px] tracking-[0.04em] text-ink hover:text-accent"
          >
            Turn back on
          </button>
        </div>
      )}

      {/* Confirmation dialog — turning the line off */}
      {confirmOff && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4">
          <div className="bg-surface rounded-sm p-8 max-w-sm w-full text-center">
            <div className="w-14 h-14 bg-paper rounded-sm flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-accent" strokeWidth="2.5">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-ink mb-2">Turn off Call Slot?</h3>
            <p className="text-muted text-sm mb-6">
              Calls will go to voicemail until you turn it back on. You might miss bookings while it&apos;s off.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setConfirmOff(false)}
                className="flex-1 py-3 rounded-sm border-2 border-line font-bold text-ink hover:bg-paper transition-colors"
              >
                Keep it on
              </button>
              <button
                onClick={() => { setConfirmOff(false); void toggleLine(false); }}
                className="flex-1 py-3 rounded-sm bg-accent text-white font-bold hover:bg-accent-hover transition-colors"
              >
                Turn off
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Subscribe prompt modal — shown when unsubscribed user tries to enable the line */}
      {subscribePromptOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setSubscribePromptOpen(false)}>
          <div className="bg-surface rounded-sm p-8 max-w-sm w-full text-center" onClick={(e) => e.stopPropagation()}>
            <div className="w-14 h-14 bg-line rounded-sm flex items-center justify-center mx-auto mb-4">
              <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-ink" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-ink mb-2">Subscription required</h3>
            <p className="text-muted text-sm mb-6">
              You need an active plan to keep Call Slot answering forwarded calls.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href="/settings/billing"
                onClick={() => setSubscribePromptOpen(false)}
                className="w-full py-3 bg-ink text-surface rounded-sm font-medium hover:bg-opacity-90 transition-colors "
              >
                Choose a Plan
              </Link>
              <button
                onClick={() => setSubscribePromptOpen(false)}
                className="w-full py-3 rounded-sm border-2 border-line font-bold text-ink hover:bg-paper transition-colors"
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
          <div className="bg-surface rounded-sm p-8 max-w-lg w-full max-h-[80vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-6">
              <div>
                <h3 className="text-xl font-bold text-ink">{transcriptCall.callerName || "Unknown Caller"}</h3>
                <p className="text-sm text-muted">{new Date(transcriptCall.createdAt).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}</p>
              </div>
              <button onClick={() => setTranscriptCall(null)} className="text-muted hover:text-ink transition-colors">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6 6 18M6 6l12 12" /></svg>
              </button>
            </div>
            <div className="space-y-4">
              <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{getStatusLabel(transcriptCall)}</p>
              {transcriptCall.appointment && (
                <div className="bg-paper rounded-sm p-4 border border-line">
                  <p className="text-xs font-bold text-ink uppercase tracking-wider mb-1">Booking Confirmed</p>
                  <p className="font-bold text-ink">{transcriptCall.appointment.petName} — {transcriptCall.appointment.serviceName}</p>
                  <p className="text-sm text-ink">
                    {new Date(transcriptCall.appointment.startTime).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" })}
                  </p>
                </div>
              )}
              <div className="bg-paper rounded-sm p-4">
                <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Call Summary</p>
                <p className="text-sm text-ink leading-relaxed">{transcriptCall.summary || "No summary available for this call."}</p>
              </div>
              {transcriptCall.transcript && (
                <details className="group">
                  <summary className="flex items-center gap-2 cursor-pointer text-xs font-bold text-muted uppercase tracking-wider hover:text-ink transition-colors">
                    <svg className="w-3 h-3 group-open:rotate-90 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="3"><path d="m9 18 6-6-6-6" /></svg>
                    Full Transcript
                  </summary>
                  <div className="mt-2 bg-surface rounded-sm border border-line p-4 max-h-60 overflow-y-auto">
                    <p className="text-sm text-muted leading-relaxed whitespace-pre-wrap">{transcriptCall.transcript}</p>
                  </div>
                </details>
              )}
              {transcriptCall.duration && (
                <p className="text-xs text-muted text-right">Duration: {formatDuration(transcriptCall.duration)}</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div data-tour="tour-calls" className="grid grid-cols-1 gap-y-6 border-y border-line py-7 sm:grid-cols-3 sm:gap-x-8">
        {[
          {
            label: "Calls",
            value: String(stats.callsThisWeek),
            note: stats.callsLastWeek > 0
              ? `${Math.round(((stats.callsThisWeek - stats.callsLastWeek) / stats.callsLastWeek) * 100) === 0 ? "7 days" : `${Math.round(((stats.callsThisWeek - stats.callsLastWeek) / stats.callsLastWeek) * 100) > 0 ? "+" : ""}${Math.round(((stats.callsThisWeek - stats.callsLastWeek) / stats.callsLastWeek) * 100)}%`}`
              : "7 days",
          },
          { label: "Slots heard", value: String(stats.bookingAttempts), note: "30 days" },
          { label: "Booked", value: String(stats.bookingsConfirmed), note: "30 days", tour: "tour-revenue" },
        ].map((metric) => (
          <div key={metric.label} {...(metric.tour ? { "data-tour": metric.tour } : {})}>
            <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">{metric.label}</p>
            <p className="mt-1.5 font-display text-[1.65rem] leading-none tracking-tight">{metric.value}</p>
            <p className="mt-1.5 text-[12px] text-muted">{metric.note}</p>
          </div>
        ))}
      </div>
      <div className="mb-10" />

      <div className="mb-12 grid grid-cols-1 gap-10 lg:grid-cols-2">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Calendar</p>
          {calendarHealth ? (
            <>
              <p className="mt-2 text-[15px] text-ink">
                {calendarHealth.canWriteEvents ? "Read + write" : calendarHealth.connected ? "Request mode" : "Not connected"}
              </p>
              <p className="mt-1 text-[13px] text-muted">{calendarHealth.message}</p>
            </>
          ) : (
            <p className="mt-2 text-[13px] text-muted">Not connected</p>
          )}
          <Link href="/settings/calendar" className="mt-3 inline-block text-[12px] text-accent hover:text-accent-hover">
            Manage calendar
          </Link>
        </div>
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">Funnel · 30 days</p>
          {funnelDropoff.length === 0 ? (
            <p className="mt-2 text-[13px] text-muted">No forwarded calls yet.</p>
          ) : (
            <div className="mt-3 divide-y divide-line border-y border-line">
              {funnelDropoff.map((row) => (
                <div key={row.event} className="flex items-baseline justify-between py-2 text-[13px]">
                  <span className="text-muted">{row.event.replace(/_/g, " ")}</span>
                  <span className="tabular-nums text-ink">
                    {row.count}
                    {row.dropoffPct > 0 ? (
                      <span className="ml-2 text-[11px] text-muted">−{row.dropoffPct}%</span>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>


      {/* Minutes Usage Widget */}
      {subscriptionActive && usageMinutesLimit > 0 && (() => {
        const pct = Math.min((usageMinutesUsed / usageMinutesLimit) * 100, 100);
        const remaining = Math.max(0, usageMinutesLimit - usageMinutesUsed);
        const isNear = pct >= 80;
        return (
          <div className="mb-10 flex items-baseline justify-between gap-4 border-b border-line pb-4">
            <p className="text-[13px] text-muted">
              {usagePlanName ? `${usagePlanName} · ` : ""}
              {usageMinutesUsed} / {usageMinutesLimit} min
            </p>
            <div className="flex items-baseline gap-4">
              <span className="text-[13px] text-ink">{remaining} remaining</span>
              {isNear && (
                <Link href="/settings/billing" className="text-[12px] text-accent hover:text-accent-hover">
                  Upgrade
                </Link>
              )}
            </div>
          </div>
        );
      })()}

      {/* SMS Quick Commands card — hidden for Call Slot MVP */}
      {false && (
      <div className="bg-surface rounded-sm border border-line px-5 py-4 mb-6">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" className="text-muted">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            <span className="text-xs font-bold text-muted uppercase tracking-wider">SMS Quick Commands</span>
          </div>
          <Link href="/settings/agent" className="text-xs font-bold text-accent hover:underline">All commands →</Link>
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
              <code className="text-xs font-bold text-ink shrink-0">&quot;{item.cmd}&quot;</code>
              <span className="text-xs text-muted truncate">— {item.desc}</span>
            </div>
          ))}
        </div>
      </div>
      )}

      <div data-tour="tour-calllog">
        <div className="mb-3 flex items-baseline justify-between gap-4">
          <h2 className="font-display text-2xl tracking-tight">The book</h2>
          <div className="flex items-baseline gap-5 text-[12px]">
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
              className="text-muted hover:text-ink disabled:opacity-50"
              title="Email yourself a weekly summary"
            >
              {digestSent ? "Sent" : sendingDigest ? "Sending…" : "Weekly recap"}
            </button>
            <Link href="/calls" className="text-muted hover:text-ink">
              All calls
            </Link>
          </div>
        </div>
        {digestError && (
          <p className="mb-3 text-[13px] text-accent">{digestError}</p>
        )}

        {recentCalls.length === 0 ? (
          <div className="border-y border-line py-8">
            <p className="font-display text-2xl text-ink">The page is still blank.</p>
            <p className="mt-1 text-[13px] text-muted">
              Forward an unanswered call and its note will land here.
            </p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-line font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                <th className="py-3 font-medium">Caller</th>
                <th className="hidden py-3 font-medium sm:table-cell">Status</th>
                <th className="hidden py-3 font-medium md:table-cell">Outcome</th>
                <th className="hidden py-3 font-medium sm:table-cell">Duration</th>
                <th className="py-3 text-right font-medium"> </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {recentCalls.map((call) => (
                <tr key={call.id}>
                  <td className="py-3.5">
                    <p className="text-[14px] text-ink">{call.callerName || "Unknown caller"}</p>
                    <p className="text-[12px] text-muted">{call.callerPhone || "No number"}</p>
                    <p className="mt-1 text-[12px] text-muted sm:hidden">{getStatusLabel(call)}</p>
                  </td>
                  <td className="hidden py-3.5 text-[13px] text-muted sm:table-cell">{getStatusLabel(call)}</td>
                  <td className="hidden py-3.5 md:table-cell">{getOutcome(call)}</td>
                  <td className="hidden py-3.5 font-mono text-[12px] text-muted sm:table-cell">
                    {call.duration ? formatDuration(call.duration) : "—"}
                  </td>
                  <td className="py-3.5 text-right">
                    <button
                      onClick={() => setTranscriptCall(call)}
                      className="text-[12px] text-muted hover:text-ink"
                    >
                      Summary
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
