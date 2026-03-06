"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatPhoneNumber, formatDateTime, formatCurrency } from "@/lib/utils";

interface NoShowStats {
  totalAppointments: number;
  noShowCount: number;
  cancelledCount: number;
  confirmedCount: number;
  noShowRate: number;
  upcomingUnconfirmed: number;
  waitlistCount: number;
  estimatedSaved: number;
}

interface RepeatOffender {
  customerName: string;
  customerPhone: string | null;
  petName: string | null;
  noShowCount: number;
  lastNoShow: string | null;
}

interface RecentNoShow {
  id: string;
  customerName: string;
  customerPhone: string | null;
  petName: string | null;
  serviceName: string | null;
  startTime: string;
  noShowMarkedAt: string | null;
}

interface PendingConfirmation {
  id: string;
  customerName: string;
  customerPhone: string | null;
  petName: string | null;
  serviceName: string | null;
  startTime: string;
  status: string;
  reminder48hSent: boolean;
  reminderSent: boolean;
}

interface WaitlistEntry {
  id: string;
  customerName: string;
  customerPhone: string;
  petName: string | null;
  serviceName: string | null;
  preferredDate: string;
  preferredTime: string | null;
  status: string;
  createdAt: string;
}

export default function NoShowProtectionPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<NoShowStats | null>(null);
  const [offenders, setOffenders] = useState<RepeatOffender[]>([]);
  const [recentNoShows, setRecentNoShows] = useState<RecentNoShow[]>([]);
  const [pendingConfirmation, setPendingConfirmation] = useState<PendingConfirmation[]>([]);
  const [waitlist, setWaitlist] = useState<WaitlistEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"pending" | "noShows" | "waitlist">("pending");
  const [showAddWaitlist, setShowAddWaitlist] = useState(false);
  const [waitlistForm, setWaitlistForm] = useState({
    customerName: "",
    customerPhone: "",
    petName: "",
    serviceName: "",
    preferredDate: "",
    preferredTime: "",
  });

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/");
      return;
    }
    if (authStatus === "authenticated") {
      fetchData();
    }
  }, [authStatus, router]);

  async function fetchData() {
    setLoading(true);
    try {
      const [statsRes, waitlistRes] = await Promise.all([
        fetch("/api/appointments/stats"),
        fetch("/api/waitlist?status=WAITING"),
      ]);

      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data.stats);
        setOffenders(data.repeatOffenders || []);
        setRecentNoShows(data.recentNoShows || []);
        setPendingConfirmation(data.pendingConfirmation || []);
      }

      if (waitlistRes.ok) {
        const data = await waitlistRes.json();
        setWaitlist(data.entries || []);
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }

  async function markNoShow(appointmentId: string) {
    try {
      const res = await fetch("/api/appointments/no-show", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ appointmentId }),
      });
      if (res.ok) fetchData();
    } catch (error) {
      console.error("Error:", error);
    }
  }

  async function addToWaitlist() {
    try {
      const res = await fetch("/api/waitlist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(waitlistForm),
      });
      if (res.ok) {
        setShowAddWaitlist(false);
        setWaitlistForm({
          customerName: "",
          customerPhone: "",
          petName: "",
          serviceName: "",
          preferredDate: "",
          preferredTime: "",
        });
        fetchData();
      }
    } catch (error) {
      console.error("Error:", error);
    }
  }

  async function removeFromWaitlist(id: string) {
    try {
      const res = await fetch(`/api/waitlist?id=${id}`, { method: "DELETE" });
      if (res.ok) fetchData();
    } catch (error) {
      console.error("Error:", error);
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-32 bg-white/50 rounded-4xl animate-pulse" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end gap-4">
        <div>
          <h1 className="text-4xl font-extrabold text-paw-brown">
            No-Show Protection
          </h1>
          <p className="text-paw-brown/60 font-medium mt-1">
            Automated reminders, waitlist fills, and repeat offender tracking
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => setShowAddWaitlist(true)}
            className="px-5 py-2.5 bg-paw-brown text-white rounded-full font-bold text-sm shadow-soft flex items-center gap-2 hover:bg-opacity-90 transition-colors"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="12" y1="5" x2="12" y2="19" />
              <line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            Add to Waitlist
          </button>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-3xl p-6 shadow-card border border-white">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-red-100 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2.5">
                <line x1="18" y1="6" x2="6" y2="18" />
                <line x1="6" y1="6" x2="18" y2="18" />
              </svg>
            </div>
            <span className="text-xs font-bold text-paw-brown/40 uppercase">No-Shows</span>
          </div>
          <p className="text-3xl font-extrabold text-paw-brown">{stats?.noShowCount || 0}</p>
          <p className="text-xs text-paw-brown/50 mt-1">
            {stats?.noShowRate || 0}% rate (30 days)
          </p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-card border border-white">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-emerald-100 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#10b981" strokeWidth="2.5">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            </div>
            <span className="text-xs font-bold text-paw-brown/40 uppercase">Confirmed</span>
          </div>
          <p className="text-3xl font-extrabold text-paw-brown">{stats?.confirmedCount || 0}</p>
          <p className="text-xs text-paw-brown/50 mt-1">Via SMS reply (30 days)</p>
        </div>

        <div className="bg-white rounded-3xl p-6 shadow-card border border-white">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-amber-100 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#f59e0b" strokeWidth="2.5">
                <circle cx="12" cy="12" r="10" />
                <line x1="12" y1="8" x2="12" y2="12" />
                <line x1="12" y1="16" x2="12.01" y2="16" />
              </svg>
            </div>
            <span className="text-xs font-bold text-paw-brown/40 uppercase">Unconfirmed</span>
          </div>
          <p className="text-3xl font-extrabold text-paw-brown">{stats?.upcomingUnconfirmed || 0}</p>
          <p className="text-xs text-paw-brown/50 mt-1">Upcoming, no reply yet</p>
        </div>

        <div className="bg-paw-brown rounded-3xl p-6 shadow-soft text-paw-cream relative overflow-hidden">
          <div className="absolute -right-4 -bottom-4 w-20 h-20 bg-paw-amber/10 rounded-full blur-xl" />
          <div className="flex items-center gap-2 mb-3">
            <div className="w-8 h-8 rounded-xl bg-white/10 flex items-center justify-center">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#FDD783" strokeWidth="2.5">
                <line x1="12" y1="1" x2="12" y2="23" />
                <path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
              </svg>
            </div>
            <span className="text-xs font-bold text-paw-amber uppercase">Revenue Saved</span>
          </div>
          <p className="text-3xl font-extrabold">{formatCurrency(stats?.estimatedSaved || 0)}</p>
          <p className="text-xs text-white/50 mt-1">Est. from confirmations</p>
        </div>
      </div>

      {/* Repeat Offenders */}
      {offenders.length > 0 && (
        <div className="bg-red-50 rounded-4xl p-8 border border-red-100">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 rounded-2xl bg-red-100 flex items-center justify-center">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" />
                <line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
            </div>
            <div>
              <h3 className="font-bold text-red-900">Repeat No-Show Offenders</h3>
              <p className="text-xs text-red-600/60">
                Customers with 2 or more no-shows — consider requiring deposits or calling to confirm
              </p>
            </div>
          </div>
          <div className="space-y-2">
            {offenders.map((offender, i) => (
              <div
                key={i}
                className="flex items-center justify-between bg-white rounded-2xl px-5 py-3 border border-red-100"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center text-red-600 font-bold text-sm">
                    {offender.noShowCount}x
                  </div>
                  <div>
                    <p className="font-bold text-paw-brown text-sm">{offender.customerName}</p>
                    <p className="text-xs text-paw-brown/50">
                      {offender.petName && `${offender.petName} · `}
                      {offender.customerPhone
                        ? formatPhoneNumber(offender.customerPhone)
                        : "No phone"}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-xs text-red-600 font-bold">
                    {offender.noShowCount} no-shows
                  </p>
                  {offender.lastNoShow && (
                    <p className="text-[10px] text-paw-brown/40">
                      Last: {formatDateTime(offender.lastNoShow)}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Tabbed Content */}
      <div>
        <div className="flex flex-wrap gap-2 mb-6">
          {[
            { key: "pending" as const, label: "Pending", count: pendingConfirmation.length },
            { key: "noShows" as const, label: "No-Shows", count: recentNoShows.length },
            { key: "waitlist" as const, label: "Waitlist", count: waitlist.length },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`px-5 py-2 rounded-full text-sm font-bold transition-all flex items-center gap-2 ${
                activeTab === tab.key
                  ? "bg-paw-brown text-white shadow-sm"
                  : "bg-white text-paw-brown/60 hover:bg-paw-cream border border-paw-brown/5"
              }`}
            >
              {tab.label}
              {tab.count > 0 && (
                <span
                  className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${
                    activeTab === tab.key
                      ? "bg-white/20 text-white"
                      : "bg-paw-brown/10 text-paw-brown/60"
                  }`}
                >
                  {tab.count}
                </span>
              )}
            </button>
          ))}
        </div>

        <div className="bg-white rounded-4xl shadow-soft overflow-x-auto border border-white">
          {/* Awaiting Confirmation Tab */}
          {activeTab === "pending" && (
            <>
              {pendingConfirmation.length === 0 ? (
                <div className="text-center py-16 text-paw-brown/50">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 opacity-30">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <p className="font-bold">All upcoming appointments are confirmed</p>
                  <p className="text-sm mt-1">48-hour reminders are sent automatically</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-paw-cream/50 border-b border-paw-brown/5">
                    <tr>
                      <th className="px-4 sm:px-8 py-4 text-xs font-bold text-paw-brown/40 uppercase tracking-wider">Customer & Pet</th>
                      <th className="px-4 sm:px-6 py-4 text-xs font-bold text-paw-brown/40 uppercase tracking-wider hidden sm:table-cell">Service</th>
                      <th className="px-4 sm:px-6 py-4 text-xs font-bold text-paw-brown/40 uppercase tracking-wider">Appointment</th>
                      <th className="px-4 sm:px-6 py-4 text-xs font-bold text-paw-brown/40 uppercase tracking-wider hidden md:table-cell">Reminder Status</th>
                      <th className="px-4 sm:px-8 py-4 text-xs font-bold text-paw-brown/40 uppercase tracking-wider text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-paw-brown/5">
                    {pendingConfirmation.map((appt) => (
                      <tr key={appt.id} className="hover:bg-paw-cream/30 transition-colors">
                        <td className="px-4 sm:px-8 py-4 sm:py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-amber-100 flex items-center justify-center font-bold text-paw-brown text-sm shrink-0">
                              {appt.customerName
                                .split(" ")
                                .map((w) => w[0])
                                .join("")
                                .slice(0, 2)}
                            </div>
                            <div className="min-w-0">
                              <p className="font-bold text-paw-brown text-sm truncate">{appt.customerName}</p>
                              <p className="text-xs text-paw-brown/50 truncate">{appt.petName || "No pet name"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 sm:px-6 py-4 sm:py-5 hidden sm:table-cell">
                          {appt.serviceName ? (
                            <span className="px-3 py-1 bg-paw-amber/20 text-paw-brown text-xs font-bold rounded-full">
                              {appt.serviceName}
                            </span>
                          ) : (
                            <span className="text-xs text-paw-brown/40 italic">—</span>
                          )}
                        </td>
                        <td className="px-4 sm:px-6 py-4 sm:py-5 text-sm font-medium text-paw-brown/70">
                          {formatDateTime(appt.startTime)}
                        </td>
                        <td className="px-4 sm:px-6 py-4 sm:py-5 hidden md:table-cell">
                          <div className="flex flex-col gap-1">
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${appt.reminder48hSent ? "bg-emerald-500" : "bg-gray-300"}`} />
                              <span className="text-[10px] font-bold text-paw-brown/50">48h SMS</span>
                            </div>
                            <div className="flex items-center gap-1.5">
                              <span className={`w-1.5 h-1.5 rounded-full ${appt.reminderSent ? "bg-emerald-500" : "bg-gray-300"}`} />
                              <span className="text-[10px] font-bold text-paw-brown/50">24h SMS</span>
                            </div>
                          </div>
                        </td>
                        <td className="px-4 sm:px-8 py-4 sm:py-5 text-right">
                          <button
                            onClick={() => markNoShow(appt.id)}
                            className="text-red-500 font-bold text-xs hover:underline"
                          >
                            Mark No-Show
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* Recent No-Shows Tab */}
          {activeTab === "noShows" && (
            <>
              {recentNoShows.length === 0 ? (
                <div className="text-center py-16 text-paw-brown/50">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 opacity-30">
                    <circle cx="12" cy="12" r="10" />
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                  <p className="font-bold">No no-shows recorded</p>
                  <p className="text-sm mt-1">Keep it up!</p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-paw-cream/50 border-b border-paw-brown/5">
                    <tr>
                      <th className="px-8 py-4 text-xs font-bold text-paw-brown/40 uppercase tracking-wider">Customer & Pet</th>
                      <th className="px-6 py-4 text-xs font-bold text-paw-brown/40 uppercase tracking-wider">Service</th>
                      <th className="px-6 py-4 text-xs font-bold text-paw-brown/40 uppercase tracking-wider">Missed Appointment</th>
                      <th className="px-8 py-4 text-xs font-bold text-paw-brown/40 uppercase tracking-wider text-right">Phone</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-paw-brown/5">
                    {recentNoShows.map((ns) => (
                      <tr key={ns.id} className="hover:bg-paw-cream/30 transition-colors">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-red-100 flex items-center justify-center font-bold text-red-500 text-sm">
                              {ns.customerName
                                .split(" ")
                                .map((w) => w[0])
                                .join("")
                                .slice(0, 2)}
                            </div>
                            <div>
                              <p className="font-bold text-paw-brown text-sm">{ns.customerName}</p>
                              <p className="text-xs text-paw-brown/50">{ns.petName || "—"}</p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          <span className="text-sm text-paw-brown/60">{ns.serviceName || "—"}</span>
                        </td>
                        <td className="px-6 py-5 text-sm font-medium text-paw-brown/70">
                          {formatDateTime(ns.startTime)}
                        </td>
                        <td className="px-8 py-5 text-right text-sm text-paw-brown/50">
                          {ns.customerPhone ? formatPhoneNumber(ns.customerPhone) : "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}

          {/* Waitlist Tab */}
          {activeTab === "waitlist" && (
            <>
              {waitlist.length === 0 ? (
                <div className="text-center py-16 text-paw-brown/50">
                  <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-4 opacity-30">
                    <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
                    <circle cx="9" cy="7" r="4" />
                    <line x1="23" y1="11" x2="17" y2="11" />
                  </svg>
                  <p className="font-bold">Waitlist is empty</p>
                  <p className="text-sm mt-1">
                    When a slot opens from a cancellation, the first person on the waitlist gets notified automatically.
                  </p>
                </div>
              ) : (
                <table className="w-full text-left">
                  <thead className="bg-paw-cream/50 border-b border-paw-brown/5">
                    <tr>
                      <th className="px-8 py-4 text-xs font-bold text-paw-brown/40 uppercase tracking-wider">Customer & Pet</th>
                      <th className="px-6 py-4 text-xs font-bold text-paw-brown/40 uppercase tracking-wider">Service</th>
                      <th className="px-6 py-4 text-xs font-bold text-paw-brown/40 uppercase tracking-wider">Preferred Date</th>
                      <th className="px-6 py-4 text-xs font-bold text-paw-brown/40 uppercase tracking-wider">Added</th>
                      <th className="px-8 py-4 text-xs font-bold text-paw-brown/40 uppercase tracking-wider text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-paw-brown/5">
                    {waitlist.map((entry) => (
                      <tr key={entry.id} className="hover:bg-paw-cream/30 transition-colors">
                        <td className="px-8 py-5">
                          <div className="flex items-center gap-3">
                            <div className="w-9 h-9 rounded-full bg-paw-sky flex items-center justify-center font-bold text-paw-brown text-sm">
                              {entry.customerName
                                .split(" ")
                                .map((w) => w[0])
                                .join("")
                                .slice(0, 2)}
                            </div>
                            <div>
                              <p className="font-bold text-paw-brown text-sm">{entry.customerName}</p>
                              <p className="text-xs text-paw-brown/50">
                                {entry.petName || formatPhoneNumber(entry.customerPhone)}
                              </p>
                            </div>
                          </div>
                        </td>
                        <td className="px-6 py-5">
                          {entry.serviceName ? (
                            <span className="px-3 py-1 bg-paw-sky text-paw-brown text-xs font-bold rounded-full">
                              {entry.serviceName}
                            </span>
                          ) : (
                            <span className="text-xs text-paw-brown/40 italic">Any</span>
                          )}
                        </td>
                        <td className="px-6 py-5 text-sm font-medium text-paw-brown/70">
                          {formatDateTime(entry.preferredDate)}
                          {entry.preferredTime && ` (${entry.preferredTime})`}
                        </td>
                        <td className="px-6 py-5 text-sm font-medium text-paw-brown/70">
                          {formatDateTime(entry.createdAt)}
                        </td>
                        <td className="px-8 py-5 text-right">
                          <button
                            onClick={() => removeFromWaitlist(entry.id)}
                            className="text-red-500 font-bold text-xs hover:underline"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </>
          )}
        </div>
      </div>

      {/* How It Works Section */}
      <div className="bg-paw-brown rounded-4xl p-10 text-paw-cream relative overflow-hidden">
        <div className="absolute -right-10 -bottom-10 w-48 h-48 bg-paw-amber/10 rounded-full blur-3xl" />
        <h3 className="text-xl font-bold text-paw-amber mb-6">How No-Show Protection Works</h3>
        <div className="grid md:grid-cols-4 gap-6">
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-paw-amber font-bold">1</div>
            <h4 className="font-bold text-sm">48h Reminder</h4>
            <p className="text-xs text-white/60">Customer gets an SMS 48 hours before. They can reply CONFIRM or CANCEL with one tap.</p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-paw-amber font-bold">2</div>
            <h4 className="font-bold text-sm">Follow-Up</h4>
            <p className="text-xs text-white/60">No response? We send another reminder at 12 hours. Still no reply? You&apos;re notified.</p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-paw-amber font-bold">3</div>
            <h4 className="font-bold text-sm">Waitlist Fill</h4>
            <p className="text-xs text-white/60">If they cancel, the system auto-texts the first person on the waitlist to fill the slot.</p>
          </div>
          <div className="space-y-2">
            <div className="w-10 h-10 rounded-2xl bg-white/10 flex items-center justify-center text-paw-amber font-bold">4</div>
            <h4 className="font-bold text-sm">Offender Tracking</h4>
            <p className="text-xs text-white/60">Repeat no-shows get flagged so you can require deposits or manual confirmation.</p>
          </div>
        </div>
      </div>

      {/* Add to Waitlist Dialog */}
      <Dialog open={showAddWaitlist} onOpenChange={setShowAddWaitlist}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="text-paw-brown">Add to Waitlist</DialogTitle>
            <DialogDescription>
              They&apos;ll be auto-notified when a matching slot opens up from a cancellation.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 mt-2">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-paw-brown/60 uppercase mb-1">
                  Customer Name *
                </label>
                <input
                  type="text"
                  value={waitlistForm.customerName}
                  onChange={(e) =>
                    setWaitlistForm({ ...waitlistForm, customerName: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-paw-cream rounded-xl border border-paw-brown/10 focus:outline-none focus:border-paw-amber text-sm"
                  placeholder="Jane Smith"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-paw-brown/60 uppercase mb-1">
                  Phone *
                </label>
                <input
                  type="tel"
                  value={waitlistForm.customerPhone}
                  onChange={(e) =>
                    setWaitlistForm({ ...waitlistForm, customerPhone: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-paw-cream rounded-xl border border-paw-brown/10 focus:outline-none focus:border-paw-amber text-sm"
                  placeholder="(555) 123-4567"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-paw-brown/60 uppercase mb-1">
                  Pet Name
                </label>
                <input
                  type="text"
                  value={waitlistForm.petName}
                  onChange={(e) =>
                    setWaitlistForm({ ...waitlistForm, petName: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-paw-cream rounded-xl border border-paw-brown/10 focus:outline-none focus:border-paw-amber text-sm"
                  placeholder="Buddy"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-paw-brown/60 uppercase mb-1">
                  Service
                </label>
                <input
                  type="text"
                  value={waitlistForm.serviceName}
                  onChange={(e) =>
                    setWaitlistForm({ ...waitlistForm, serviceName: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-paw-cream rounded-xl border border-paw-brown/10 focus:outline-none focus:border-paw-amber text-sm"
                  placeholder="Full Grooming"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-paw-brown/60 uppercase mb-1">
                  Preferred Date *
                </label>
                <input
                  type="date"
                  value={waitlistForm.preferredDate}
                  onChange={(e) =>
                    setWaitlistForm({ ...waitlistForm, preferredDate: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-paw-cream rounded-xl border border-paw-brown/10 focus:outline-none focus:border-paw-amber text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-paw-brown/60 uppercase mb-1">
                  Preferred Time
                </label>
                <input
                  type="text"
                  value={waitlistForm.preferredTime}
                  onChange={(e) =>
                    setWaitlistForm({ ...waitlistForm, preferredTime: e.target.value })
                  }
                  className="w-full px-4 py-3 bg-paw-cream rounded-xl border border-paw-brown/10 focus:outline-none focus:border-paw-amber text-sm"
                  placeholder="Morning, Afternoon, 10:00 AM"
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <button
                onClick={() => setShowAddWaitlist(false)}
                className="px-5 py-2.5 bg-white rounded-full font-bold text-sm border border-paw-brown/10 hover:bg-paw-cream transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={addToWaitlist}
                disabled={!waitlistForm.customerName || !waitlistForm.customerPhone || !waitlistForm.preferredDate}
                className="px-5 py-2.5 bg-paw-brown text-white rounded-full font-bold text-sm shadow-soft hover:bg-opacity-90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Add to Waitlist
              </button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
