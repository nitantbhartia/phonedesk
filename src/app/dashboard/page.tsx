"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";

interface DashboardStats {
  callsThisWeek: number;
  callsThisMonth: number;
  bookingsConfirmed: number;
  bookingsMissed: number;
  revenueProtected: number;
  avgCallDuration: number;
}

interface RecentCall {
  id: string;
  callerName: string | null;
  callerPhone: string | null;
  status: string;
  duration: number | null;
  summary: string | null;
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
    callsThisMonth: 0,
    bookingsConfirmed: 0,
    bookingsMissed: 0,
    revenueProtected: 0,
    avgCallDuration: 0,
  });
  const [recentCalls, setRecentCalls] = useState<RecentCall[]>([]);
  const [loading, setLoading] = useState(true);
  const [agentLive, setAgentLive] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") {
      fetchDashboardData();
    }
  }, [status, router]);

  async function fetchDashboardData() {
    try {
      const [statsRes, callsRes] = await Promise.all([
        fetch("/api/business/profile"),
        fetch("/api/calls?limit=10"),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        if (data.stats) setStats(data.stats);
      }

      if (callsRes.ok) {
        const data = await callsRes.json();
        if (data.calls) setRecentCalls(data.calls);
      }
    } catch (error) {
      console.error("Error fetching dashboard data:", error);
    } finally {
      setLoading(false);
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
      {/* Header */}
      <header className="flex flex-col md:flex-row justify-between items-start md:items-center mb-10 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold text-paw-brown">
            Welcome back, {firstName} 👋
          </h1>
          <p className="text-paw-brown/60 font-medium">
            Here&apos;s what RingPaw handled for you this week.
          </p>
        </div>

        <div className="flex items-center gap-6">
          {/* Agent Status Toggle */}
          <div className="flex items-center gap-3 bg-white px-5 py-3 rounded-full shadow-sm border border-paw-brown/5">
            <span className="text-sm font-bold text-paw-brown/70">
              Agent Status
            </span>
            <label className="flex items-center cursor-pointer">
              <div className="relative">
                <input
                  type="checkbox"
                  className="sr-only"
                  checked={agentLive}
                  onChange={(e) => setAgentLive(e.target.checked)}
                />
                <div
                  className={`w-12 h-6 rounded-full shadow-inner transition-colors ${
                    agentLive ? "bg-paw-orange" : "bg-gray-200"
                  }`}
                />
                <div
                  className={`absolute left-1 top-1 bg-white w-4 h-4 rounded-full transition-transform shadow-sm ${
                    agentLive ? "translate-x-6" : ""
                  }`}
                />
              </div>
              <div className="ml-3 text-paw-brown font-bold text-sm">
                {agentLive ? "Live" : "Off"}
              </div>
            </label>
          </div>

          {/* User info */}
          <div className="hidden md:flex items-center gap-3">
            <div className="text-right">
              <p className="text-sm font-bold text-paw-brown">
                {session?.user?.name || "User"}
              </p>
              <p className="text-xs text-paw-brown/50">
                {session?.user?.email || ""}
              </p>
            </div>
            <div className="w-12 h-12 rounded-full border-2 border-white shadow-sm bg-paw-amber/30 flex items-center justify-center font-bold text-paw-brown">
              {session?.user?.name?.[0] || "U"}
            </div>
          </div>
        </div>
      </header>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-6 mb-10">
        {/* Calls Handled */}
        <div className="bg-white p-6 rounded-[2rem] shadow-card border border-white/50">
          <div className="w-10 h-10 bg-paw-sky rounded-2xl flex items-center justify-center text-paw-brown mb-4">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
            </svg>
          </div>
          <p className="text-sm font-bold text-paw-brown/50 uppercase tracking-wider">
            Calls Handled
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-paw-brown">
              {stats.callsThisWeek}
            </span>
            {stats.callsThisWeek > 0 && (
              <span className="text-green-500 text-sm font-bold">+12%</span>
            )}
          </div>
          <p className="text-xs text-paw-brown/40 mt-1">Past 7 days</p>
        </div>

        {/* Bookings */}
        <div className="bg-white p-6 rounded-[2rem] shadow-card border border-white/50">
          <div className="w-10 h-10 bg-paw-amber/20 rounded-2xl flex items-center justify-center text-paw-brown mb-4">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <path d="M20 6 9 17l-5-5" />
            </svg>
          </div>
          <p className="text-sm font-bold text-paw-brown/50 uppercase tracking-wider">
            Bookings
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-paw-brown">
              {stats.bookingsConfirmed}
            </span>
            <span className="text-xs font-bold text-paw-brown/40">
              vs {stats.bookingsMissed} missed
            </span>
          </div>
          <div className="w-full bg-gray-100 h-1.5 rounded-full mt-3 flex overflow-hidden">
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
        <div className="bg-white p-6 rounded-[2rem] shadow-card border border-white/50">
          <div className="w-10 h-10 bg-paw-orange/10 rounded-2xl flex items-center justify-center text-paw-orange mb-4">
            <svg
              width="20"
              height="20"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
            >
              <line x1="12" y1="1" x2="12" y2="23" />
              <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
            </svg>
          </div>
          <p className="text-sm font-bold text-paw-brown/50 uppercase tracking-wider">
            Est. Revenue Protected
          </p>
          <div className="flex items-baseline gap-2">
            <span className="text-4xl font-extrabold text-paw-brown">
              ${stats.revenueProtected.toLocaleString()}
            </span>
          </div>
          <p className="text-xs text-paw-brown/40 mt-1">
            Based on ${avgServicePrice} average groom
          </p>
        </div>

        {/* Next Appointment */}
        <div className="bg-paw-brown p-6 rounded-[2.5rem] shadow-soft relative overflow-hidden group">
          <svg
            className="absolute -right-4 -bottom-4 w-24 h-24 text-white/5 opacity-10"
            fill="currentColor"
            viewBox="0 0 200 200"
          >
            <path d="M100 0C60 40 20 80 0 140C40 130 80 110 100 200C120 110 160 130 200 140C180 80 140 40 100 0Z" />
          </svg>
          <p className="text-sm font-bold text-paw-amber uppercase tracking-wider mb-2">
            Next Appointment
          </p>
          {recentCalls.find((c) => c.appointment) ? (
            <>
              <p className="text-2xl font-bold text-white">
                {recentCalls.find((c) => c.appointment)?.appointment?.petName ||
                  "Upcoming"}
              </p>
              <p className="text-sm text-white/70">
                {recentCalls.find((c) => c.appointment)?.appointment?.startTime
                  ? new Date(
                      recentCalls.find((c) => c.appointment)!.appointment!.startTime
                    ).toLocaleDateString("en-US", {
                      weekday: "long",
                      hour: "numeric",
                      minute: "2-digit",
                    })
                  : ""}
              </p>
            </>
          ) : (
            <>
              <p className="text-2xl font-bold text-white">None scheduled</p>
              <p className="text-sm text-white/70">No upcoming appointments</p>
            </>
          )}
          <button className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 transition-all rounded-xl text-xs font-bold text-white uppercase tracking-widest">
            View Details
          </button>
        </div>
      </div>

      {/* Recent Call Log */}
      <div className="bg-white rounded-[2.5rem] shadow-card border border-white/50 overflow-hidden">
        <div className="px-8 py-6 border-b border-gray-50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <h2 className="text-xl font-bold text-paw-brown">Recent Call Log</h2>
          <div className="flex gap-2">
            <button className="px-4 py-2 rounded-full border border-gray-100 text-sm font-bold hover:bg-paw-sky transition-colors">
              Filter
            </button>
            <button className="px-4 py-2 rounded-full bg-paw-brown text-white text-sm font-bold hover:opacity-90 transition-all shadow-sm">
              Download All
            </button>
          </div>
        </div>

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
              <p className="font-bold">No calls yet</p>
              <p className="text-sm mt-1">
                Calls will appear here once your AI receptionist starts
                answering.
              </p>
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="text-xs font-bold text-paw-brown/40 uppercase tracking-widest border-b border-gray-50 bg-paw-cream/30">
                  <th className="px-8 py-4">Caller</th>
                  <th className="px-8 py-4">Status</th>
                  <th className="px-8 py-4">Outcome</th>
                  <th className="px-8 py-4">Duration</th>
                  <th className="px-8 py-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {recentCalls.map((call) => {
                  const displayName =
                    call.callerName || call.callerPhone || "Unknown";
                  const initials = getInitials(
                    call.callerName || call.callerPhone?.slice(-4) || "UN"
                  );
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
                      <td className="px-8 py-5">
                        <div className="flex items-center gap-3">
                          <div
                            className={`w-10 h-10 rounded-full ${bgColor} flex items-center justify-center font-bold text-paw-brown`}
                          >
                            {initials}
                          </div>
                          <div>
                            <p className="text-sm font-bold text-paw-brown">
                              {call.callerName || "Unknown Caller"}
                            </p>
                            <p className="text-xs text-paw-brown/50">
                              {call.callerPhone || "No number"}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-8 py-5">{getStatusBadge(call)}</td>
                      <td className="px-8 py-5">{getOutcome(call)}</td>
                      <td className="px-8 py-5 text-sm text-paw-brown/60">
                        {call.duration
                          ? formatDuration(call.duration)
                          : "--"}
                      </td>
                      <td className="px-8 py-5 text-right">
                        <Link
                          href={`/calls?id=${call.id}`}
                          className="inline-flex items-center gap-2 text-paw-brown font-bold text-sm hover:text-paw-orange transition-colors"
                        >
                          View Transcript
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2"
                          >
                            <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                            <polyline points="15 3 21 3 21 9" />
                            <line x1="10" y1="14" x2="21" y2="3" />
                          </svg>
                        </Link>
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
