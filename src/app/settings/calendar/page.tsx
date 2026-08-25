"use client";

import { Suspense, useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { readApiError } from "@/lib/client-api";
import { InfoIcon } from "@/components/ui/info-icon";
import { toast } from "@/components/ui/toast";

interface CalendarConnection {
  id: string;
  provider: string;
  isPrimary: boolean;
  isActive: boolean;
  calendarId: string | null;
  createdAt: string;
}

type SavedBusinessHours = Record<string, { open: string; close: string }>;

type HoursState = Record<
  string,
  { open: string; close: string; enabled: boolean }
>;

interface Conflict {
  start: string;
  end: string;
  summary: string;
  source: string;
}

const DAY_ABBREVS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];

const TIME_OPTIONS = [
  "6:00 AM", "7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM",
  "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM",
  "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM",
];

const DEFAULT_HOURS: HoursState = {
  "Mon - Fri": { open: "9:00 AM", close: "5:00 PM", enabled: true },
  Saturday: { open: "10:00 AM", close: "2:00 PM", enabled: false },
  Sunday: { open: "9:00 AM", close: "5:00 PM", enabled: false },
};

function toTwentyFourHour(value: string) {
  if (!value.includes("AM") && !value.includes("PM")) return value;
  const [time, meridiem] = value.split(" ");
  const [rawHour, minute] = time.split(":");
  let hour = Number(rawHour);
  if (meridiem === "AM") {
    if (hour === 12) hour = 0;
  } else if (meridiem === "PM" && hour !== 12) {
    hour += 12;
  }
  return `${hour.toString().padStart(2, "0")}:${minute}`;
}

function toTwelveHour(value: string) {
  if (value.includes("AM") || value.includes("PM")) return value;
  const [rawHour, minute] = value.split(":");
  const hour = Number(rawHour);
  const meridiem = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${minute} ${meridiem}`;
}

function buildHoursState(savedHours?: SavedBusinessHours | null): HoursState {
  if (!savedHours) return { ...DEFAULT_HOURS };

  const weekdayHours =
    savedHours["mon-fri"] || savedHours.mon || savedHours.tue ||
    savedHours.wed || savedHours.thu || savedHours.fri;
  const saturdayHours = savedHours.sat || savedHours.saturday;
  const sundayHours = savedHours.sun || savedHours.sunday;

  return {
    "Mon - Fri": weekdayHours
      ? { open: toTwelveHour(weekdayHours.open), close: toTwelveHour(weekdayHours.close), enabled: true }
      : { ...DEFAULT_HOURS["Mon - Fri"], enabled: false },
    Saturday: saturdayHours
      ? { open: toTwelveHour(saturdayHours.open), close: toTwelveHour(saturdayHours.close), enabled: true }
      : { ...DEFAULT_HOURS.Saturday },
    Sunday: sundayHours
      ? { open: toTwelveHour(sundayHours.open), close: toTwelveHour(sundayHours.close), enabled: true }
      : { ...DEFAULT_HOURS.Sunday },
  };
}

function serializeHours(hours: HoursState): SavedBusinessHours {
  const result: SavedBusinessHours = {};
  for (const [day, h] of Object.entries(hours)) {
    if (!h.enabled) continue;
    if (day === "Mon - Fri") {
      for (const weekday of ["mon", "tue", "wed", "thu", "fri"]) {
        result[weekday] = { open: toTwentyFourHour(h.open), close: toTwentyFourHour(h.close) };
      }
    } else {
      const shortKey = day === "Saturday" ? "sat" : day === "Sunday" ? "sun" : day.toLowerCase();
      result[shortKey] = { open: toTwentyFourHour(h.open), close: toTwentyFourHour(h.close) };
    }
  }
  return result;
}

export default function CalendarSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-surface">
          <div className="animate-pulse text-muted">Loading...</div>
        </div>
      }
    >
      <CalendarSettingsPageContent />
    </Suspense>
  );
}

function CalendarSettingsPageContent() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [connections, setConnections] = useState<CalendarConnection[]>([]);
  const [loading, setLoading] = useState(true);
  const [pageError, setPageError] = useState("");
  const [pageNotice, setPageNotice] = useState("");
  const [disconnecting, setDisconnecting] = useState<string | null>(null);
  const [primaryConnectionId, setPrimaryConnectionId] = useState<string>("");
  const [respectBusy, setRespectBusy] = useState(true);
  const [bufferTime, setBufferTime] = useState(true);
  const [bookingLogicSaving, setBookingLogicSaving] = useState(false);
  const [bookingLogicSaved, setBookingLogicSaved] = useState(false);
  const [hours, setHours] = useState<HoursState>({ ...DEFAULT_HOURS });
  const [savedHoursJson, setSavedHoursJson] = useState("");
  const [saving, setSaving] = useState(false);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [conflictsLoading, setConflictsLoading] = useState(false);
  const [conflictsTz, setConflictsTz] = useState("America/Los_Angeles");
  const refreshTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const hoursDirty = JSON.stringify(serializeHours(hours)) !== savedHoursJson;

  useEffect(() => {
    if (searchParams.get("error") === "calendar_connect_failed") {
      setPageError("Calendar connection failed. Please reconnect and try again.");
    }
  }, [searchParams]);

  const fetchConflicts = useCallback(async () => {
    setConflictsLoading(true);
    try {
      const res = await fetch("/api/calendar/conflicts?days=3");
      if (res.ok) {
        const data = await res.json();
        setConflicts(data.conflicts || []);
        if (data.timezone) setConflictsTz(data.timezone);
      }
    } catch {
      toast.error("Failed to load calendar conflicts. Please refresh.");
    } finally {
      setConflictsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") {
      fetchData();
      fetchConflicts();
      // Auto-refresh conflicts every 2 minutes
      refreshTimerRef.current = setInterval(fetchConflicts, 2 * 60 * 1000);
    }
    return () => {
      if (refreshTimerRef.current) clearInterval(refreshTimerRef.current);
    };
  }, [status, router, fetchConflicts]);

  async function fetchData() {
    setPageError("");
    try {
      const res = await fetch("/api/business/profile");
      if (!res.ok) {
        setPageError(await readApiError(res, "Failed to load calendar settings."));
        return;
      }
      const data = await res.json();
      const conns: CalendarConnection[] = data.business?.calendarConnections || [];
      setConnections(conns);
      const primary = conns.find((c) => c.isPrimary);
      if (primary) setPrimaryConnectionId(primary.id);
      else if (conns.length > 0) setPrimaryConnectionId(conns[0].id);
      const bh = data.business?.businessHours as SavedBusinessHours | undefined;
      const built = buildHoursState(bh);
      setHours(built);
      setSavedHoursJson(JSON.stringify(serializeHours(built)));
    } catch (error) {
      console.error("Error fetching calendar settings:", error);
      setPageError("Failed to load calendar settings. Please refresh.");
    } finally {
      setLoading(false);
    }
  }

  async function saveBookingLogic() {
    if (!primaryConnectionId) {
      setPageError("Connect a calendar before choosing a primary destination.");
      return;
    }

    setBookingLogicSaving(true);
    setBookingLogicSaved(false);
    setPageError("");
    setPageNotice("");
    try {
      const res = await fetch("/api/calendar/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          primaryConnectionId,
        }),
      });
      if (!res.ok) {
        throw new Error(
          await readApiError(res, "Failed to save primary destination.")
        );
      }
      setBookingLogicSaved(true);
      setPageNotice("Primary booking destination saved.");
      setTimeout(() => setBookingLogicSaved(false), 3000);
    } catch (error) {
      setPageError(
        error instanceof Error
          ? error.message
          : "Failed to save settings. Please try again."
      );
    } finally {
      setBookingLogicSaving(false);
    }
  }

  async function saveHours() {
    setSaving(true);
    try {
      const businessHours = serializeHours(hours);
      const res = await fetch("/api/business/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ businessHours }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save");
      }
      setSavedHoursJson(JSON.stringify(businessHours));
      setLastSaved(new Date());
      toast.success("Hours saved");
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Failed to save hours");
    } finally {
      setSaving(false);
    }
  }

  async function disconnectCalendar(provider: string) {
    setDisconnecting(provider);
    try {
      const res = await fetch(`/api/calendar/connect?provider=${provider}`, {
        method: "DELETE",
      });
      if (res.ok) {
        await fetchData();
        setPageNotice(`${provider} calendar disconnected.`);
      } else {
        setPageError(
          await readApiError(res, "Failed to disconnect calendar. Please try again.")
        );
      }
    } catch {
      setPageError("Failed to disconnect calendar. Please try again.");
    } finally {
      setDisconnecting(null);
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
        <div className="h-8 w-64 bg-surface rounded-sm animate-pulse" />
        <div className="h-64 bg-surface rounded-sm animate-pulse" />
      </div>
    );
  }

  const googleConn = getConnection("GOOGLE");
  const userEmail = session?.user?.email || "";

  return (
    <div className="space-y-8">
      {pageError && (
        <div className="rounded-sm border border-line bg-paper px-5 py-4 text-sm font-medium text-accent">
          {pageError}
        </div>
      )}
      {pageNotice && (
        <div className="rounded-sm border border-line bg-paper px-5 py-4 text-sm font-medium text-ink">
          {pageNotice}
        </div>
      )}

      {/* Calendar Integration Section */}
      <section className="border border-line bg-surface p-6 sm:p-10">
        <div className="mb-8">
          <h1 className="font-display text-[2.35rem] tracking-tight text-ink">
            Bookings
          </h1>
          <p className="mt-2 text-[14px] text-muted">
            Connect your booking tools so Call Slot can manage your availability
            in real-time.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Google Calendar */}
          <div
            className={`relative flex flex-col items-center overflow-hidden border bg-paper p-6 text-center ${
              isConnected("GOOGLE")
              ? "border-line"
              : "border-transparent hover:border-line"
              } transition-all`}
          >
            {isConnected("GOOGLE") && (
              <div className="absolute right-3 top-3 flex items-center gap-1 bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                CONNECTED
              </div>
            )}
            <div className="w-14 h-14 bg-surface rounded-sm flex items-center justify-center mb-4">
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
            <h3 className="text-[16px] text-ink">Google Calendar</h3>
            <p className="mb-4 text-xs text-muted">
              {isConnected("GOOGLE")
                ? googleConn?.calendarId || userEmail
                : "Not connected"}
            </p>
            {isConnected("GOOGLE") ? (
              <button
                onClick={() => disconnectCalendar("GOOGLE")}
                disabled={disconnecting === "GOOGLE"}
                className="text-xs text-accent transition-colors hover:text-accent-hover disabled:opacity-50"
              >
                {disconnecting === "GOOGLE" ? "Disconnecting\u2026" : "Disconnect"}
              </button>
            ) : (
              <button
                onClick={() => connectCalendar("google")}
                className="w-full bg-ink px-4 py-2 text-xs text-surface transition-all hover:bg-opacity-90"
              >
                Connect Account
              </button>
            )}
          </div>
              
          {/* Square Appointments */}
          <div
            className={`relative flex flex-col items-center overflow-hidden border bg-paper p-6 text-center ${
              isConnected("SQUARE")
              ? "border-line"
              : "border-transparent hover:border-line"
              } transition-all`}
          >
            {isConnected("SQUARE") && (
              <div className="absolute right-3 top-3 flex items-center gap-1 bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                CONNECTED
              </div>
            )}
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-sm border border-line bg-surface">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="#1C1916">
                <rect x="2" y="2" width="20" height="20" rx="4" />
                <path d="M7 10h4v4H7zM13 10h4v4h-4z" fill="#FAF7F1" />
              </svg>
            </div>
            <h3 className="text-[16px] text-ink">Square Appointments</h3>
            <p className="mb-4 text-xs text-muted">
              {isConnected("SQUARE") ? "Connected" : "Not connected"}
            </p>
            {isConnected("SQUARE") ? (
              <button
                onClick={() => disconnectCalendar("SQUARE")}
                disabled={disconnecting === "SQUARE"}
                className="text-xs text-accent transition-colors hover:text-accent-hover disabled:opacity-50"
              >
                {disconnecting === "SQUARE" ? "Disconnecting\u2026" : "Disconnect"}
              </button>
            ) : (
              <button
                onClick={() => connectCalendar("square")}
                className="w-full bg-ink px-4 py-2 text-xs text-surface transition-all hover:bg-opacity-90"
              >
                Connect Account
              </button>
            )}
          </div>
              
          {/* Acuity Scheduling */}
          <div
            className={`relative flex flex-col items-center overflow-hidden border bg-paper p-6 text-center ${
              isConnected("ACUITY")
              ? "border-line"
              : "border-transparent hover:border-line"
              } transition-all`}
          >
            {isConnected("ACUITY") && (
              <div className="absolute right-3 top-3 flex items-center gap-1 bg-paper px-2 py-1 font-mono text-[10px] uppercase tracking-[0.12em] text-ink">
                <span className="h-1.5 w-1.5 rounded-full bg-accent" />
                CONNECTED
              </div>
            )}
            <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-sm border border-line bg-surface">
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#6E2C2C" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                <line x1="16" x2="16" y1="2" y2="6" />
                <line x1="8" x2="8" y1="2" y2="6" />
                <line x1="3" x2="21" y1="10" y2="10" />
                <path d="m9 16 2 2 4-4" />
              </svg>
            </div>
            <h3 className="text-[16px] text-ink">Acuity Scheduling</h3>
            <p className="mb-4 text-xs text-muted">
              {isConnected("ACUITY") ? "Connected" : "Not connected"}
            </p>
            {isConnected("ACUITY") ? (
              <button
                onClick={() => disconnectCalendar("ACUITY")}
                disabled={disconnecting === "ACUITY"}
                className="text-xs text-accent transition-colors hover:text-accent-hover disabled:opacity-50"
              >
                {disconnecting === "ACUITY" ? "Disconnecting\u2026" : "Disconnect"}
              </button>
            ) : (
              <button
                onClick={() => connectCalendar("acuity")}
                className="w-full bg-ink px-4 py-2 text-xs text-surface transition-all hover:bg-opacity-90"
              >
                Connect Account
              </button>
            )}
          </div>
        </div>
              
        <div className="mt-6 flex gap-3 border-t border-line bg-paper p-4">
          <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.16em] text-accent">Note</span>
          <p className="text-[13px] leading-relaxed text-ink/80">
            <strong>Using another booking system?</strong>{" "}
            Connect the same Google Calendar that your booking system syncs
            with. When Call Slot books an appointment, it&apos;ll show as busy there
            too — preventing double-bookings
            automatically.
          </p>
        </div>
      </section>
              
      {/* Business Hours Section */}
      <section className="border border-line bg-surface p-6 sm:p-10">
        <div className="mb-6">
          <h2 className="font-display text-2xl text-ink">
            <span className="inline-flex items-center gap-2">
              Business Hours
              <InfoIcon text="Call Slot will only offer appointment slots that fall within these hours. Callers asking for times outside your hours will be told you're closed." />
            </span>
          </h2>
          <p className="mt-1 text-[13px] text-muted">
            Set the hours Call Slot can offer appointment slots.
          </p>
        </div>
              
        <div className="space-y-4 border-y border-line bg-paper p-6">
          {Object.entries(hours).map(([day, h]) => (
            <div
              key={day}
              className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 py-2 sm:py-1"
            >
              <div className="flex items-center justify-between sm:justify-start">
                <span
                  className={`font-bold w-24 ${
                    h.enabled ? "text-ink" : "text-muted"
                  }`}
                >
                  {day}
                </span>
                <label className="relative inline-flex items-center cursor-pointer sm:hidden">
                  <input
                    type="checkbox"
                    checked={h.enabled}
                    onChange={(e) =>
                      setHours({
                        ...hours,
                        [day]: { ...h, enabled: e.target.checked },
                      })
                    }
                    className="sr-only peer"
                  />
                  <div className="h-6 w-11 rounded-sm bg-line peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-line after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-sm after:border after:border-gray-300 after:bg-surface after:content-[''] after:transition-all peer-checked:bg-accent" />
                </label>
              </div>
              {h.enabled ? (
                <div className="flex items-center gap-3">
                  <select
                    value={h.open}
                    onChange={(e) =>
                      setHours({
                        ...hours,
                        [day]: { ...h, open: e.target.value },
                      })
                    }
                    className="appearance-none border border-line bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none transition-all"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                  <span className="text-muted font-bold">to</span>
                  <select
                    value={h.close}
                    onChange={(e) =>
                      setHours({
                        ...hours,
                        [day]: { ...h, close: e.target.value },
                      })
                    }
                    className="appearance-none border border-line bg-surface px-3 py-2 text-sm focus:border-ink focus:outline-none transition-all"
                  >
                    {TIME_OPTIONS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              ) : (
                <span className="text-sm font-bold text-muted">
                  Closed
                </span>
              )}
              <label className="relative inline-flex items-center cursor-pointer hidden sm:inline-flex">
                <input
                  type="checkbox"
                  checked={h.enabled}
                  onChange={(e) =>
                    setHours({
                      ...hours,
                      [day]: { ...h, enabled: e.target.checked },
                    })
                  }
                  className="sr-only peer"
                />
                <div className="h-6 w-11 rounded-sm bg-line peer peer-focus:outline-none peer-checked:after:translate-x-full peer-checked:after:border-line after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-sm after:border after:border-gray-300 after:bg-surface after:content-[''] after:transition-all peer-checked:bg-accent" />
              </label>
            </div>
          ))}
        </div>

        <div className="mt-6 flex items-center justify-end gap-3">
          {lastSaved && !hoursDirty && (
            <span className="text-xs text-muted font-medium">
              Saved {lastSaved.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
            </span>
          )}
          {hoursDirty && (
            <button
              onClick={fetchData}
            className="border border-line bg-surface px-6 py-3 text-sm text-ink transition-all hover:bg-paper"
            >
              Discard
            </button>
          )}
          <button
            onClick={saveHours}
            disabled={saving || !hoursDirty}
            className="bg-ink px-8 py-3 text-sm text-surface transition-all disabled:opacity-50"
          >
            {saving ? "Saving\u2026" : "Save Hours"}
          </button>
        </div>
      </section>

      {/* Booking Logic + Conflict Checker */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 lg:gap-8">
        {/* Booking Logic */}
        <section className="h-full border border-line bg-surface p-6 sm:p-10">
          <h3 className="mb-6 font-display text-2xl text-ink">
            Booking Logic
          </h3>

          <div className="space-y-6">
            <div>
              <label className="mb-3 block font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  Primary Destination
                  <InfoIcon text="The calendar where Call Slot writes new bookings. If you have multiple connected calendars, pick the one you use for appointments." />
                </span>
              </label>
              <div className="relative">
                {connections.filter((c) => c.isActive).length === 0 ? (
                  <div className="w-full border border-line bg-paper px-5 py-4 text-sm text-muted">
                    No calendars connected — connect one above
                  </div>
                ) : (
                  <select
                    value={primaryConnectionId}
                    onChange={(e) => setPrimaryConnectionId(e.target.value)}
                    className="w-full appearance-none border border-line bg-paper px-5 py-4 focus:border-ink focus:outline-none transition-all"
                  >
                    {connections.filter((c) => c.isActive).map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.provider === "GOOGLE"
                          ? `Google Calendar${c.calendarId ? `: ${c.calendarId}` : ""}`
                          : c.provider === "SQUARE"
                            ? "Square Appointments"
                            : c.provider === "ACUITY"
                              ? "Acuity Scheduling"
                              : c.provider}
                      </option>
                    ))}
                  </select>
                )}
                {connections.filter((c) => c.isActive).length > 0 && (
                  <div className="absolute right-5 top-1/2 -translate-y-1/2 pointer-events-none">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="m6 9 6 6 6-6" />
                    </svg>
                  </div>
                )}
              </div>
            </div>

            <div>
              <label className="mb-3 block font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                <span className="inline-flex items-center gap-1.5">
                  Conflict Checking
                  <InfoIcon text="Advanced conflict controls are not editable yet. Call Slot already respects conflicts from your connected calendar data." />
                </span>
              </label>
              <div className="space-y-3">
                <label className="flex items-center gap-3 border border-line bg-paper p-4 opacity-60">
                  <input
                    type="checkbox"
                    checked={respectBusy}
                    disabled
                    className="h-4 w-4 rounded-sm accent-accent"
                  />
                  <span className="text-[13px] text-ink/80">
                    Respect &quot;Busy&quot; events on personal calendar
                  </span>
                </label>
                <label className="flex items-center gap-3 border border-line bg-paper p-4 opacity-60">
                  <input
                    type="checkbox"
                    checked={bufferTime}
                    disabled
                    className="h-4 w-4 rounded-sm accent-accent"
                  />
                  <span className="text-[13px] text-ink/80">
                    Block 15m buffer before &amp; after each appointment
                  </span>
                </label>
                <p className="text-xs font-medium text-muted">
                  These advanced controls are coming soon. Right now you can save the primary booking destination above.
                </p>
              </div>
            </div>
          </div>

          <div className="mt-6 flex items-center justify-end gap-3">
            {bookingLogicSaved && (
              <span className="text-xs text-ink font-medium">Saved</span>
            )}
            <button
              onClick={() => void saveBookingLogic()}
              disabled={bookingLogicSaving || !primaryConnectionId}
              className="bg-ink px-8 py-3 text-sm text-surface transition-all disabled:opacity-50"
            >
              {bookingLogicSaving ? "Saving…" : "Save Primary Destination"}
            </button>
          </div>
        </section>

        {/* Conflict Checker */}
        <section className="relative h-full overflow-hidden border border-line bg-paper p-6 text-ink sm:p-10">

          <div className="flex items-center justify-between mb-6">
            <h3 className="font-display text-2xl text-ink">
              Calendar conflicts
            </h3>
            <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
              Next 3 days
            </span>
          </div>

          <div className="space-y-4">
            {conflictsLoading && conflicts.length === 0 ? (
              <div className="space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-20 border border-line bg-surface p-4 animate-pulse" />
                ))}
              </div>
            ) : conflicts.length === 0 ? (
              <div className="border border-line bg-surface p-6 text-center">
                <p className="mb-1 font-display text-xl text-ink">All clear</p>
                <p className="text-xs text-muted">
                  {connections.length === 0
                    ? "Connect a calendar to see conflicts"
                    : "No conflicts found in the next 3 days"}
                </p>
              </div>
            ) : (
              conflicts.slice(0, 6).map((c, i) => {
                const startDate = new Date(c.start);
                const endDate = new Date(c.end);
                const dayAbbr = DAY_ABBREVS[startDate.getDay()];
                const dayNum = new Intl.DateTimeFormat("en-US", {
                  day: "numeric",
                  timeZone: conflictsTz,
                }).format(startDate);
                const startTime = new Intl.DateTimeFormat("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: conflictsTz,
                }).format(startDate);
                const endTime = new Intl.DateTimeFormat("en-US", {
                  hour: "numeric",
                  minute: "2-digit",
                  timeZone: conflictsTz,
                }).format(endDate);

                return (
                  <div
                    key={i}
                    className="flex gap-4 border border-line bg-surface p-4"
                  >
                    <div className="w-12 text-center shrink-0">
                      <p className="font-mono text-[10px] text-muted">{dayAbbr}</p>
                      <p className="font-display text-xl">{dayNum}</p>
                    </div>
                    <div className="min-w-0 flex-1 space-y-2 border-l border-line pl-4">
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-[13px]">
                          {startTime} — {endTime}
                        </span>
                        <span className="shrink-0 font-mono text-[9px] uppercase tracking-[0.12em] text-accent">
                          BLOCKED
                        </span>
                      </div>
                      <p className="truncate text-xs text-muted">
                        {c.summary} ({c.source})
                      </p>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mt-6 flex justify-center">
            <button
              onClick={fetchConflicts}
              disabled={conflictsLoading}
              className="border-b border-line pb-1 text-xs text-accent transition-all hover:border-ink disabled:opacity-50"
            >
              {conflictsLoading ? "Refreshing\u2026" : "Refresh conflicts · auto-syncs every 2m"}
            </button>
          </div>
        </section>
      </div>
    </div>
  );
}
