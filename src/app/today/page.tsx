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
  { value: "CHECKED_IN", label: "Checked In", color: "bg-paper text-ink" },
  { value: "IN_PROGRESS", label: "In Progress", color: "bg-paper text-ink" },
  { value: "READY_FOR_PICKUP", label: "Ready for Pickup", color: "bg-paper text-ink" },
  { value: "PICKED_UP", label: "Picked Up", color: "bg-paper text-muted" },
];

export default function TodayPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const [appointments, setAppointments] = useState<TodayAppointment[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState("");
  const [updating, setUpdating] = useState<string | null>(null);
  const [statusError, setStatusError] = useState("");
  const [noteModal, setNoteModal] = useState<{ appointmentId: string; petName: string } | null>(null);
  const [noteText, setNoteText] = useState("");
  const [noteSaving, setNoteSaving] = useState(false);
  const [noteError, setNoteError] = useState("");

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
      const res = await fetch("/api/appointments/today");
      if (res.ok) {
        const data = await res.json();
        setAppointments(data.appointments || []);
      }
    } catch {
      setFetchError("Failed to load today's appointments. Please refresh.");
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
      } else {
        setStatusError("Failed to update status. Please try again.");
      }
    } catch {
      setStatusError("Failed to update status. Please try again.");
    } finally {
      setUpdating(null);
    }
  }

  function openNoteModal(appointmentId: string, petName: string) {
    setNoteModal({ appointmentId, petName });
    setNoteText("");
    setNoteError("");
  }

  async function saveNote() {
    if (!noteModal || !noteText.trim()) return;
    setNoteSaving(true);
    setNoteError("");
    try {
      const res = await fetch("/api/behavior", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          petName: noteModal.petName,
          appointmentId: noteModal.appointmentId,
          severity: "NOTE",
          note: noteText.trim(),
          tags: [],
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save note");
      }
      setNoteModal(null);
      setNoteText("");
    } catch (error) {
      setNoteError(error instanceof Error ? error.message : "Failed to save note");
    } finally {
      setNoteSaving(false);
    }
  }

  function getStatusBadge(status: string | null) {
    const found = GROOMING_STATUSES.find((s) => s.value === status);
    if (!found) return null;
    return (
      <span className={`px-3 py-1 rounded-sm text-xs font-bold ${found.color}`}>
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
          <div key={i} className="h-24 bg-surface rounded-sm animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-[2.35rem] tracking-tight text-ink">Today</h1>
        <p className="text-muted font-medium mt-1">
          One-tap status updates — customers get auto-notified via SMS
        </p>
      </div>

      {fetchError && (
        <div className="flex items-center gap-3 bg-paper border border-line rounded-sm px-5 py-4">
          <p className="flex-1 text-sm text-accent font-medium">{fetchError}</p>
          <button onClick={() => setFetchError("")} className="text-muted hover:text-accent text-xs font-bold">Dismiss</button>
        </div>
      )}

      {statusError && (
        <div className="flex items-center gap-3 bg-paper border border-line rounded-sm px-5 py-4">
          <p className="flex-1 text-sm text-accent font-medium">{statusError}</p>
          <button onClick={() => setStatusError("")} className="text-muted hover:text-accent text-xs font-bold">Dismiss</button>
        </div>
      )}

      {appointments.length === 0 ? (
        <div className="border border-line bg-surface p-8">
          <p className="text-sm text-muted">No appointments scheduled today.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {appointments.map((appt) => {
            const nextStatus = getNextStatus(appt.groomingStatus);
            const isUpdating = updating === appt.id;

            return (
              <div
                key={appt.id}
                className={`bg-surface rounded-sm border border-line p-6 transition-all ${
                  appt.groomingStatus === "PICKED_UP" ? "opacity-60" : ""
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 sm:gap-4 min-w-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-sm bg-line flex items-center justify-center font-bold text-ink shrink-0 text-sm">
                      {(appt.petName || appt.customerName)
                        .split(" ")
                        .map((w) => w[0])
                        .join("")
                        .slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <p className="font-bold text-ink text-sm sm:text-base truncate">
                        {appt.petName || "Pet"}{" "}
                        <span className="text-muted font-normal">({appt.customerName})</span>
                      </p>
                      <div className="flex flex-wrap items-center gap-2 mt-1">
                        {appt.serviceName && (
                          <span className="px-2.5 py-0.5 bg-line text-ink text-xs font-bold rounded-sm">
                            {appt.serviceName}
                          </span>
                        )}
                        <span className="text-xs text-muted">
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
                        className="px-4 sm:px-5 py-2 sm:py-2.5 bg-ink text-white rounded-sm font-medium text-xs sm:text-sm hover:bg-opacity-90 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {isUpdating ? "..." : getNextStatusLabel(appt.groomingStatus)}
                      </button>
                    )}

                    <button
                      onClick={() => openNoteModal(appt.id, appt.petName || "Pet")}
                      className="p-2 sm:p-2.5 bg-surface rounded-sm hover:bg-line transition-colors shrink-0"
                      title="Add behavior note"
                    >
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-muted">
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

      {/* Behavior Note Modal */}
      {noteModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 px-4" onClick={() => setNoteModal(null)}>
          <div className="bg-surface rounded-sm p-8 max-w-sm w-full " onClick={(e) => e.stopPropagation()}>
            <h3 className="text-xl font-bold text-ink mb-1">Behavior Note</h3>
            <p className="text-sm text-muted mb-5">For {noteModal.petName}</p>
            <textarea
              autoFocus
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
              placeholder="e.g. Very anxious near scissors, did well with dryer..."
              rows={4}
              className="w-full rounded-sm border-2 border-line p-4 text-sm font-medium resize-none focus:outline-none focus:border-ink transition-all"
            />
            {noteError && (
              <p className="text-accent text-xs mt-2">{noteError}</p>
            )}
            <div className="flex gap-3 mt-5">
              <button
                onClick={() => setNoteModal(null)}
                className="flex-1 py-3 rounded-sm border-2 border-line font-bold text-ink hover:bg-paper transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => void saveNote()}
                disabled={noteSaving || !noteText.trim()}
                className="flex-1 py-3 rounded-sm bg-ink text-white font-bold hover:opacity-90 transition-colors disabled:opacity-50"
              >
                {noteSaving ? "Saving…" : "Save Note"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* How it works */}
      <div className="border border-line bg-surface p-8 text-ink">
        <h3 className="font-display text-2xl tracking-tight mb-6">How status updates work</h3>
        <div className="grid md:grid-cols-4 gap-6">
          <div className="space-y-2">
            <div className="font-mono text-[12px] text-accent">01</div>
            <h4 className="font-medium text-sm">Check In</h4>
            <p className="text-xs text-muted">Customer drops off pet. Tap &quot;Checked In&quot; — they get a text confirming.</p>
          </div>
          <div className="space-y-2">
            <div className="font-mono text-[12px] text-accent">02</div>
            <h4 className="font-medium text-sm">In Progress</h4>
            <p className="text-xs text-muted">Start grooming. Tap &quot;In Progress&quot; — customer knows their pet is in the chair.</p>
          </div>
          <div className="space-y-2">
            <div className="font-mono text-[12px] text-accent">03</div>
            <h4 className="font-medium text-sm">Ready for Pickup</h4>
            <p className="text-xs text-muted">Done grooming. Tap &quot;Ready&quot; — customer gets pickup notification with address.</p>
          </div>
          <div className="space-y-2">
            <div className="font-mono text-[12px] text-accent">04</div>
            <h4 className="font-medium text-sm">Picked Up</h4>
            <p className="text-xs text-muted">Customer picks up. Appointment marked complete. Review request sent 2h later.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
