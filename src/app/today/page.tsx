"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { formatDateTime } from "@/lib/utils";

interface TodayAppointment {
  id: string;
  customerName: string;
  customerPhone: string | null;
  petName: string | null;
  petBreed: string | null;
  serviceName: string | null;
  startTime: string;
  endTime: string;
  status: string;
  groomingStatus: string | null;
  groomingStatusAt: string | null;
}

const GROOMING_STATUSES = [
  { value: "CHECKED_IN", label: "Checked In", color: "bg-blue-100 text-blue-700" },
  { value: "IN_PROGRESS", label: "In Progress", color: "bg-amber-100 text-amber-700" },
  { value: "READY_FOR_PICKUP", label: "Ready for Pickup", color: "bg-emerald-100 text-emerald-700" },
  { value: "PICKED_UP", label: "Picked Up", color: "bg-gray-100 text-gray-500" },
];

export default function TodayPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const [appointments, setAppointments] = useState<TodayAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/");
      return;
    }
    if (authStatus === "authenticated") {
      fetchToday();
    }
  }, [authStatus, router]);

  async function fetchToday() {
    try {
      const res = await fetch("/api/calls?limit=0&today=1");
      // Use a dedicated endpoint if available, or fall back to appointments stats
      const statsRes = await fetch("/api/appointments/stats");
      if (statsRes.ok) {
        const data = await statsRes.json();
        // Get today's appointments from pending confirmation + transform
        const todayAppts = (data.pendingConfirmation || []).concat(
          (data.recentNoShows || [])
        );
        // Actually, let's fetch today's appointments directly
        const todayRes = await fetch("/api/appointments/today");
        if (todayRes.ok) {
          const todayData = await todayRes.json();
          setAppointments(todayData.appointments || []);
        }
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function updateStatus(appointmentId: string, status: string) {
    setUpdating(appointmentId);
    try {
      const res = await fetch("/api/appointments/status", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId, status }),
      });
      if (res.ok) {
        // Update local state
        setAppointments((prev) =>
          prev.map((a) =>
            a.id === appointmentId
              ? { ...a, groomingStatus: status, groomingStatusAt: new Date().toISOString() }
              : a
          )
        );
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setUpdating(null);
    }
  }

  async function logBehaviorNote(appointmentId: string, petName: string) {
    const note = prompt(`Behavior note for ${petName}:`);
    if (!note) return;

    try {
      await fetch("/api/behavior", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petName,
          appointmentId,
          severity: "NOTE",
          note,
          tags: [],
        }),
      });
      alert(`Note saved for ${petName}`);
    } catch (error) {
      console.error("Error:", error);
    }
  }

  function getStatusBadge(status: string | null) {
    const found = GROOMING_STATUSES.find((s) => s.value === status);
    if (!found) return null;
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-bold ${found.color}`}>
        {found.label}
      </span>
    );
  }

  function getNextStatus(current: string | null): string | null {
    if (!current) return "CHECKED_IN";
    const order = ["CHECKED_IN", "IN_PROGRESS", "READY_FOR_PICKUP", "PICKED_UP"];
    const idx = order.indexOf(current);
    if (idx < order.length - 1) return order[idx + 1];
    return null;
  }

  function getNextStatusLabel(current: string | null): string {
    const next = getNextStatus(current);
    if (!next) return "";
    const found = GROOMING_STATUSES.find((s) => s.value === next);
    return found?.label || next;
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-24 bg-white/50 rounded-3xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-extrabold text-paw-brown">Today&apos;s Appointments</h1>
        <p className="text-paw-brown/60 font-medium mt-1">
          One-tap status updates — customers get auto-notified via SMS
        </p>
      </div>

      {appointments.length === 0 ? (
        <div className="bg-white rounded-4xl shadow-soft p-16 text-center">
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 text-paw-brown/30">
            <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
            <line x1="16" y1="2" x2="16" y2="6" />
            <line x1="8" y1="2" x2="8" y2="6" />
            <line x1="3" y1="10" x2="21" y2="10" />
          </svg>
          <p className="font-bold text-paw-brown/50">No appointments scheduled today</p>
          <p className="text-sm text-paw-brown/40 mt-1">Appointments will appear here as they&apos;re booked</p>
        </div>
      ) : (
        <div className="space-y-4">
          {appointments.map((appt) => {
            const nextStatus = getNextStatus(appt.groomingStatus);
            const isUpdating = updating === appt.id;

            return (
              <div
                key={appt.id}
                className={`bg-white rounded-3xl shadow-card border border-white p-6 transition-all ${
                  appt.groomingStatus === "PICKED_UP" ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-paw-amber/20 flex items-center justify-center font-bold text-paw-brown shrink-0 text-sm">
                      {(appt.petName || appt.customerName)
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-paw-brown text-sm sm:text-base truncate">
                        {appt.petName || "Pet"}{" "}
                        <span className="text-paw-brown/40 font-normal">({appt.customerName})</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {appt.serviceName && (
                          <span className="px-2.5 py-0.5 bg-paw-amber/20 text-paw-brown text-xs font-bold rounded-full">
                            {appt.serviceName}
                          </span>
                        )}
                        <span className="text-xs text-paw-brown/50">
                          {formatDateTime(appt.startTime)}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 sm:gap-3 pl-[52px] sm:pl-0 shrink-0">
                    {getStatusBadge(appt.groomingStatus)}

                    {nextStatus && (
                      <button
                        onClick={() => updateStatus(appt.id, nextStatus)}
                        disabled={isUpdating}
                        className="px-4 sm:px-5 py-2 sm:py-2.5 bg-paw-brown text-white rounded-full font-bold text-xs sm:text-sm shadow-soft hover:bg-opacity-90 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {isUpdating ? "..." : getNextStatusLabel(appt.groomingStatus)}
                      </button>
                    )}

                    <button
                      onClick={() => logBehaviorNote(appt.id, appt.petName || "Pet")}
                      className="p-2 sm:p-2.5 bg-paw-cream rounded-xl hover:bg-paw-amber/20 transition-colors shrink-0"
                      title="Add behavior note"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-paw-brown/60">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* How it works */}
      <div className="bg-paw-brown rounded-4xl p-10 text-paw-cream relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-paw-amber/10 rounded-full blur-3xl" />
        <h3 className="text-xl font-bold text-paw-amber mb-6">How Status Updates Work</h3>
        <div className="grid md:grid-cols-4 gap-6">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-paw-amber font-bold">1</div>
            <h4 className="font-bold text-sm">Check In</h4>
            <p className="text-xs text-white/60">Customer drops off pet. Tap &quot;Checked In&quot; — they get a text confirming.</p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-paw-amber font-bold">2</div>
            <h4 className="font-bold text-sm">In Progress</h4>
            <p className="text-xs text-white/60">Start grooming. Tap &quot;In Progress&quot; — customer knows their pet is in the chair.</p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-paw-amber font-bold">3</div>
            <h4 className="font-bold text-sm">Ready for Pickup</h4>
            <p className="text-xs text-white/60">Done grooming. Tap &quot;Ready&quot; — customer gets pickup notification with address.</p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-paw-amber font-bold">4</div>
            <h4 className="font-bold text-sm">Picked Up</h4>
            <p className="text-xs text-white/60">Customer picks up. Appointment marked complete. Review request sent 2h later.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
