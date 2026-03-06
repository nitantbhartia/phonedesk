"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { InfoIcon } from "@/components/ui/info-icon";

interface CalendarConnection {
  id: string;
  provider: string;
  isPrimary: boolean;
  isActive: boolean;
  calendarId: string | null;
  createdAt: string;
}

export default function CalendarSettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [respectBusy, setRespectBusy] = useState(true);
  const [bufferTime, setBufferTime] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") fetchConnections();
  }, [status, router]);

  async function fetchConnections() {
    try {
      const res = await fetch("/api/business/profile");
      if (res.ok) {
        const data = await res.json();
        setConnections(data.business?.calendarConnections || []);
      }
    } catch (error) {
      console.error("Error fetching calendars:", error);
    } finally {
      setLoading(false);
    }
  }

  function connectCalendar(provider: string) {
    const params = new URLSearchParams({
      provider,
      redirect: "/settings/calendar",
    });
    window.location.href = `/api/calendar/connect?${params}`;
  }

  function isConnected(provider: string) {
    return connections.some(
      (c) => c.provider === provider && c.isActive
    );
  }

  function getConnection(provider: string) {
    return connections.find((c) => c.provider === provider);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-8 w-64 bg-white/50 rounded-2xl animate-pulse" />
        <div className="h-64 bg-white/50 rounded-4xl animate-pulse" />
      </div>
    );
  }

  const googleConn = getConnection("GOOGLE");
  const userEmail = session?.user?.email || "";

  return (
    <div className="space-y-8">
      {/* Calendar Integration Section */}
      <section className="bg-white rounded-4xl p-6 sm:p-10 shadow-soft border border-white">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-paw-brown">
            Calendar Integration
          </h1>
          <p className="text-paw-brown/60 mt-2 font-medium">
            Connect your booking tools so RingPaw can manage your availability
            in real-time.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Google Calendar */}
          <div
            className={`p-6 bg-paw-cream rounded-3xl border-2 flex flex-col items-center text-center relative overflow-hidden ${
              isConnected("GOOGLE")
                ? "border-paw-amber"
                : "border-transparent hover:border-paw-brown/10"
            } transition-all`}
          >
            {isConnected("GOOGLE") && (
              <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                CONNECTED
              </div>
            )}
            <div className="w-14 h-14 bg-white rounded-2xl flex items-center justify-center shadow-sm mb-4">
              <svg width="32" height="32" viewBox="0 0 24 24">
                <path
                  fill="#4285F4"
                  d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z"
                />
                <path
                  fill="#EA4335"
                  d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
                />
              </svg>
            </div>
            <h3 className="font-bold text-lg mb-1">Google Calendar</h3>
            <p className="text-xs text-paw-brown/50 mb-4 font-medium">
              {isConnected("GOOGLE")
                ? googleConn?.calendarId || userEmail
                : "Not connected"}
            </p>
            {isConnected("GOOGLE") ? (
              <button className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors">
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => connectCalendar("google")}
                className="w-full py-2 px-4 bg-paw-brown text-paw-cream rounded-full text-xs font-bold hover:bg-opacity-90 transition-all"
              >
                Connect Account
              </button>
            )}
          </div>

          {/* Square Appointments */}
          <div
            className={`p-6 bg-paw-cream rounded-3xl border-2 flex flex-col items-center text-center relative overflow-hidden ${
              isConnected("SQUARE")
                ? "border-paw-amber"
                : "border-transparent hover:border-paw-brown/10"
            } transition-all`}
          >
            {isConnected("SQUARE") && (
              <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                CONNECTED
              </div>
            )}
            <div className="w-14 h-14 bg-black rounded-2xl flex items-center justify-center shadow-sm mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="white">
                <rect x="2" y="2" width="20" height="20" rx="4" />
                <path d="M7 10h4v4H7zM13 10h4v4h-4z" fill="black" />
              </svg>
            </div>
            <h3 className="font-bold text-lg mb-1">Square Appointments</h3>
            <p className="text-xs text-paw-brown/50 mb-4 font-medium">
              {isConnected("SQUARE") ? "Connected" : "Not connected"}
            </p>
            {isConnected("SQUARE") ? (
              <button className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors">
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => connectCalendar("square")}
                className="w-full py-2 px-4 bg-paw-brown text-paw-cream rounded-full text-xs font-bold hover:bg-opacity-90 transition-all"
              >
                Connect Account
              </button>
            )}
          </div>

          {/* Acuity Scheduling */}
          <div
            className={`p-6 bg-paw-cream rounded-3xl border-2 flex flex-col items-center text-center relative overflow-hidden ${
              isConnected("ACUITY")
                ? "border-paw-amber"
                : "border-transparent hover:border-paw-brown/10"
            } transition-all`}
          >
            {isConnected("ACUITY") && (
              <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-[10px] font-bold">
                <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                CONNECTED
              </div>
            )}
            <div className="w-14 h-14 bg-[#316FA8] rounded-2xl flex items-center justify-center shadow-sm mb-4">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
                <path d="m9 16 2 2 4-4" />
              </svg>
            </div>
            <h3 className="font-bold text-lg mb-1">Acuity Scheduling</h3>
            <p className="text-xs text-paw-brown/50 mb-4 font-medium">
              {isConnected("ACUITY") ? "Connected" : "Not connected"}
            </p>
            {isConnected("ACUITY") ? (
              <button className="text-xs font-bold text-red-500 hover:text-red-700 transition-colors">
                Disconnect
              </button>
            ) : (
              <button
                onClick={() => connectCalendar("acuity")}
                className="w-full py-2 px-4 bg-paw-brown text-paw-cream rounded-full text-xs font-bold hover:bg-opacity-90 transition-all"
              >
                Connect Account
              </button>
            )}
          </div>
        </div>
      </section>

      {/* Booking Logic + Conflict Checker */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {/* Booking Logic */}
        <section className="bg-white rounded-4xl p-6 sm:p-10 shadow-soft border border-white h-full">
          <h3 className="text-xl font-bold text-paw-brown mb-6">
            Booking Logic
          </h3>

          <div className="space-y-6">
            <div>
              <label className="block text-sm font-bold text-paw-brown/60 uppercase mb-3">
                <span className="inline-flex items-center gap-1.5">
                  Primary Destination
                  <InfoIcon text="Where confirmed appointments are written by default." />
                </span>
              </label>
              <div className="relative">
                <select className="w-full appearance-none bg-paw-cream border-2 border-paw-brown/5 rounded-2xl px-5 py-4 font-bold focus:outline-none focus:border-paw-amber transition-all">
                  <option>Google Calendar: Appointments</option>
                  <option>Google Calendar: Main Work</option>
                  <option>Square Appointments Sync</option>
                </select>
                <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none">
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.5"
                  >
                    <path d="m6 9 6 6 6-6" />
                  </svg>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-bold text-paw-brown/60 uppercase mb-3">
                <span className="inline-flex items-center gap-1.5">
                  Conflict Checking
                  <InfoIcon text="Rules the AI uses to avoid double-booking." />
                </span>
              </label>
              <div className="space-y-3">
                <label className="flex items-center gap-3 p-4 bg-paw-cream/50 rounded-2xl cursor-pointer hover:bg-paw-cream transition-colors border border-transparent hover:border-paw-brown/5">
                  <input
                    type="checkbox"
                    checked={respectBusy}
                    onChange={(e) => setRespectBusy(e.target.checked)}
                    className="w-5 h-5 rounded-md accent-paw-orange"
                  />
                  <span className="font-bold text-paw-brown/80">
                    Respect &quot;Busy&quot; events on personal calendar
                  </span>
                </label>
                <label className="flex items-center gap-3 p-4 bg-paw-cream/50 rounded-2xl cursor-pointer hover:bg-paw-cream transition-colors border border-transparent hover:border-paw-brown/5">
                  <input
                    type="checkbox"
                    checked={bufferTime}
                    onChange={(e) => setBufferTime(e.target.checked)}
                    className="w-5 h-5 rounded-md accent-paw-orange"
                  />
                  <span className="font-bold text-paw-brown/80">
                    Block 15m buffer before &amp; after each dog
                  </span>
                </label>
              </div>
            </div>
          </div>
        </section>

        {/* Conflict Checker */}
        <section className="bg-paw-brown text-paw-cream rounded-4xl p-6 sm:p-10 shadow-soft relative overflow-hidden h-full">
          <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-paw-amber/10 rounded-full blur-3xl" />

          <div className="flex items-center justify-between mb-6">
            <h3 className="text-xl font-bold text-paw-amber">
              Conflict Checker
            </h3>
            <span className="px-3 py-1 bg-white/10 rounded-full text-[10px] font-bold tracking-widest text-paw-amber">
              LIVE PREVIEW
            </span>
          </div>

          <div className="space-y-4">
            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 flex gap-4 border border-white/10">
              <div className="w-12 text-center">
                <p className="text-[10px] font-bold text-white/40">THU</p>
                <p className="text-lg font-bold">21</p>
              </div>
              <div className="flex-1 border-l border-white/20 pl-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">
                    09:00 AM — 10:30 AM
                  </span>
                  <span className="px-2 py-0.5 bg-paw-orange/20 text-paw-orange rounded text-[9px] font-bold">
                    CONFLICT
                  </span>
                </div>
                <p className="text-xs text-white/60">
                  Found &quot;Personal: Dentist&quot; on Google Cal. Slot
                  blocked for AI agent.
                </p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 flex gap-4 border border-white/10 opacity-60">
              <div className="w-12 text-center">
                <p className="text-[10px] font-bold text-white/40">THU</p>
                <p className="text-lg font-bold">21</p>
              </div>
              <div className="flex-1 border-l border-white/20 pl-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">
                    11:00 AM — 12:00 PM
                  </span>
                  <span className="px-2 py-0.5 bg-green-500/20 text-green-400 rounded text-[9px] font-bold">
                    AVAILABLE
                  </span>
                </div>
                <p className="text-xs text-white/60">
                  Open slot. RingPaw can book new clients here.
                </p>
              </div>
            </div>

            <div className="bg-white/10 backdrop-blur-sm rounded-2xl p-4 flex gap-4 border border-white/10">
              <div className="w-12 text-center">
                <p className="text-[10px] font-bold text-white/40">THU</p>
                <p className="text-lg font-bold">21</p>
              </div>
              <div className="flex-1 border-l border-white/20 pl-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold">
                    01:30 PM — 02:45 PM
                  </span>
                  <span className="px-2 py-0.5 bg-paw-orange/20 text-paw-orange rounded text-[9px] font-bold">
                    CONFLICT
                  </span>
                </div>
                <p className="text-xs text-white/60">
                  Found &quot;Grooming: Max&quot; (Square). Slot blocked.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-center">
            <button className="text-xs font-bold text-paw-amber border-b border-paw-amber/30 hover:border-paw-amber transition-all pb-1">
              Refresh conflicts (Auto-syncs every 2m)
            </button>
          </div>
        </section>
      </div>

      {/* Save buttons */}
      <div className="flex flex-col sm:flex-row sm:justify-end gap-3 sm:gap-4">
        <button className="w-full sm:w-auto px-8 py-4 bg-white text-paw-brown font-bold rounded-full border border-paw-brown/10 hover:bg-paw-cream transition-all">
          Discard Changes
        </button>
        <button className="w-full sm:w-auto px-10 py-4 bg-paw-brown text-paw-cream font-bold rounded-full shadow-soft hover:shadow-xl hover:-translate-y-0.5 transition-all">
          Save Settings
        </button>
      </div>
    </div>
  );
}
