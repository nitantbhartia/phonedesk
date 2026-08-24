"use client";

import { useCallback, useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { formatPhoneNumber, formatDuration, formatDateTime } from "@/lib/utils";
import { computeCallScorecard } from "@/lib/call-scorecard";

interface CallRecord {
  id: string;
  callerName: string | null;
  callerPhone: string | null;
  status: string;
  duration: number | null;
  summary: string | null;
  transcript: string | null;
  extractedData: Record<string, string> | null;
  createdAt: string;
  appointment: {
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

function ScoreBadge({ call }: { call: CallRecord }) {
  const { total, max, label } = computeCallScorecard(call);
  const colorClass =
    total >= 6
      ? "bg-paper text-ink"
      : total >= 4
      ? "bg-paper text-ink"
      : "bg-paper text-accent";
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-sm text-xs font-bold tabular-nums ${colorClass}`}
      title={`Call quality: ${label}`}
    >
      {total}/{max}
    </span>
  );
}

export default function CallLogPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("all");
  const [search, setSearch] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);
  const [fetchError, setFetchError] = useState("");

  const pageSize = 20;

  function exportCSV() {
    if (!calls.length) return;
    const headers = ["Date", "Caller Name", "Phone", "Status", "Pet", "Service", "Duration (s)", "Summary"];
    const rows = calls.map((c) => [
      new Date(c.createdAt).toLocaleString(),
      c.callerName || "",
      c.callerPhone || "",
      c.appointment ? "Confirmed" : c.status,
      c.appointment?.petName || "",
      c.appointment?.serviceName || "",
      c.duration ?? "",
      (c.summary || "").replace(/[\n\r,]/g, " "),
    ]);
    const csv = [headers, ...rows].map((r) => r.map((v) => `"${v}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `calls-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  const fetchCalls = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (page * pageSize).toString(),
      });
      if (filter !== "all") params.set("status", filter);
      if (search) params.set("search", search);

      const res = await fetch(`/api/calls?${params}`);
      if (res.ok) {
        const data = await res.json();
        setCalls(data.calls || []);
        setTotal(data.total || 0);
      }
    } catch {
      setFetchError("Failed to load calls. Please refresh.");
    } finally {
      setLoading(false);
    }
  }, [filter, page, search]);

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/");
      return;
    }
    if (authStatus === "authenticated") void fetchCalls();
  }, [authStatus, fetchCalls, router]);

  const totalPages = Math.ceil(total / pageSize);

  const filters = [
    { value: "all", label: "All Calls" },
    { value: "COMPLETED", label: "Confirmed" },
    { value: "NO_BOOKING", label: "Soft Booking" },
    { value: "MISSED", label: "Missed" },
  ];

  return (
    <div>
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-end mb-10 gap-4">
        <div>
          <h1 className="font-display text-4xl tracking-tight text-ink">Call log</h1>
          <p className="text-muted font-medium mt-1">
            Every forwarded call Call Slot picked up — tap any row to see what was booked.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={exportCSV}
            disabled={calls.length === 0}
            className="px-5 py-2.5 bg-surface rounded-sm font-medium text-sm border border-line flex items-center gap-2 hover:bg-surface transition-colors disabled:opacity-40"
          >
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
            >
              <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
              <polyline points="7 10 12 15 17 10" />
              <line x1="12" y1="15" x2="12" y2="3" />
            </svg>
            Export CSV
          </button>
        </div>
      </div>

      {fetchError && (
        <div className="flex items-center gap-3 bg-paper border border-line rounded-sm px-5 py-4">
          <p className="flex-1 text-sm text-accent font-medium">{fetchError}</p>
          <button onClick={() => setFetchError("")} className="text-muted hover:text-accent text-xs font-bold">Dismiss</button>
        </div>
      )}

      {/* Search bar */}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setSearch(searchInput);
          setPage(0);
        }}
        className="flex gap-2 mb-6"
      >
        <div className="relative flex-1 max-w-md">
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            className="absolute left-4 top-1/2 -translate-y-1/2 text-muted pointer-events-none"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, phone, or transcript…"
            className="w-full pl-10 pr-4 py-2.5 bg-surface rounded-sm border border-line text-sm font-medium focus:outline-none focus:border-ink transition-all"
          />
        </div>
        <button
          type="submit"
          className="px-5 py-2.5 bg-ink text-white rounded-sm font-medium text-sm hover:bg-opacity-90 transition-colors"
        >
          Search
        </button>
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(""); setSearchInput(""); setPage(0); }}
            className="px-4 py-2.5 bg-surface rounded-sm font-medium text-sm border border-line hover:bg-surface transition-colors text-muted"
          >
            Clear
          </button>
        )}
      </form>

      {/* Filter tabs */}
      <div className="flex flex-wrap gap-2 mb-6">
        {filters.map((f) => (
          <button
            key={f.value}
            onClick={() => {
              setFilter(f.value);
              setPage(0);
            }}
            className={`px-5 py-2 rounded-sm text-sm font-medium transition-all ${
              filter === f.value
              ? "bg-ink text-white "
              : "bg-surface text-muted hover:bg-surface border border-line"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-surface rounded-sm overflow-hidden border border-line">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-16 bg-surface rounded-sm animate-pulse"
              />
            ))}
          </div>
        ) : calls.length === 0 ? (
          <div className="px-8 py-12 text-muted">
            <p className="text-sm">
              {filter !== "all"
                ? "No calls match this filter."
                : "No forwarded calls yet."}
            </p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-surface border-b border-line">
              <tr>
                <th className="px-4 sm:px-8 py-5 text-xs font-bold text-muted uppercase tracking-wider">
                  Caller &amp; Pet
                </th>
                <th className="px-4 sm:px-6 py-5 text-xs font-bold text-muted uppercase tracking-wider hidden sm:table-cell">
                  Service
                </th>
                <th className="px-4 sm:px-6 py-5 text-xs font-bold text-muted uppercase tracking-wider hidden sm:table-cell">
                  Status
                </th>
                <th className="px-4 sm:px-6 py-5 text-xs font-bold text-muted uppercase tracking-wider hidden md:table-cell">
                  Duration
                </th>
                <th className="px-4 sm:px-6 py-5 text-xs font-bold text-muted uppercase tracking-wider hidden md:table-cell">
                  Time
                </th>
                <th className="px-4 sm:px-6 py-5 text-xs font-bold text-muted uppercase tracking-wider hidden sm:table-cell">
                  Quality
                </th>
                <th className="px-4 sm:px-8 py-5 text-xs font-bold text-muted uppercase tracking-wider text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {calls.map((call) => {
                const displayName =
                  call.callerName || "Unknown Caller";
                const initials =
                  call.callerName
                    ? getInitials(call.callerName)
                    : "?";
                const bgColors = [
                  "bg-paper",
                  "bg-accent/10",
                  "bg-line",
                  "bg-paper",
                ];
                const bgColor =
                  call.callerName
                    ? bgColors[
                        displayName.charCodeAt(0) % bgColors.length
                      ]
                    : "bg-paper";
                const textColor =
                  call.callerName
                    ? "text-ink"
                    : "text-muted";

                return (
                  <tr
                    key={call.id}
                    className="hover:bg-surface transition-colors"
                  >
                    <td className="px-4 sm:px-8 py-4 sm:py-6">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-sm ${bgColor} flex items-center justify-center font-bold ${textColor} shrink-0`}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-ink truncate">
                            {displayName}
                          </p>
                          <p className="text-sm text-muted truncate">
                            {call.appointment?.petName
                              ? `${call.appointment.petName} · ${call.callerPhone ? formatPhoneNumber(call.callerPhone) : "No number"}`
                              : call.callerPhone
                                ? formatPhoneNumber(call.callerPhone)
                                : "No number"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 sm:py-6 hidden sm:table-cell">
                      {call.appointment?.serviceName ? (
                        <span className="px-3 py-1 bg-line text-ink text-xs font-bold rounded-sm">
                          {call.appointment.serviceName}
                        </span>
                      ) : (
                        <span className="text-sm text-muted italic">
                          Inquiry Only
                        </span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 sm:py-6 hidden sm:table-cell">
                      {call.appointment ? (
                        <div className="flex items-center gap-2 text-ink">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                          >
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          <span className="text-sm font-bold">
                            Confirmed
                          </span>
                        </div>
                      ) : call.status === "COMPLETED" ? (
                        <div className="flex items-center gap-2 text-accent">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                          >
                            <circle cx="12" cy="12" r="10" />
                            <line x1="12" y1="8" x2="12" y2="12" />
                            <line
                              x1="12"
                              y1="16"
                              x2="12.01"
                              y2="16"
                            />
                          </svg>
                          <span className="text-sm font-bold">
                            Soft Booking
                          </span>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2 text-muted">
                          <svg
                            width="16"
                            height="16"
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="3"
                          >
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                          </svg>
                          <span className="text-sm font-bold">
                            Missed
                          </span>
                        </div>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 sm:py-6 text-sm font-medium text-muted hidden md:table-cell">
                      {call.duration != null
                        ? formatDuration(call.duration)
                        : "--"}
                    </td>
                    <td className="px-4 sm:px-6 py-4 sm:py-6 text-sm font-medium text-muted hidden md:table-cell">
                      {formatDateTime(call.createdAt)}
                    </td>
                    <td className="px-4 sm:px-6 py-4 sm:py-6 hidden sm:table-cell">
                      <ScoreBadge call={call} />
                    </td>
                    <td className="px-4 sm:px-8 py-4 sm:py-6 text-right">
                      <button
                        onClick={() => setSelectedCall(call)}
                        className="text-accent font-bold text-sm hover:underline"
                      >
                        View Transcript
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}

        {/* Pagination */}
        {!loading && total > 0 && (
          <div className="px-8 py-5 bg-surface flex justify-between items-center border-t border-line">
            <p className="text-sm font-medium text-muted">
              Showing {page * pageSize + 1}–
              {Math.min((page + 1) * pageSize, total)} of {total} calls
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 0}
                className="p-2 rounded-lg border border-line hover:bg-surface transition-colors disabled:opacity-30"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button
                onClick={() => setPage(page + 1)}
                disabled={page >= totalPages - 1}
                className="p-2 rounded-lg border border-line hover:bg-surface transition-colors disabled:opacity-30"
              >
                <svg
                  width="16"
                  height="16"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.5"
                >
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Call Detail Dialog */}
      <Dialog
        open={!!selectedCall}
        onOpenChange={() => setSelectedCall(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedCall && (
            <>
              <DialogHeader>
                <DialogTitle className="text-ink">
                  Call from {selectedCall.callerName || "Unknown"}
                </DialogTitle>
                <DialogDescription>
                  {formatDateTime(selectedCall.createdAt)}
                  {selectedCall.duration != null &&
                    ` | Duration: ${formatDuration(selectedCall.duration)}`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* AI Quality Scorecard */}
                {(() => {
                  const { total, max, criteria, label } = computeCallScorecard(selectedCall);
                  const badgeColor =
                    total >= 6
                      ? "bg-paper text-ink border-line"
                      : total >= 4
                      ? "bg-paper text-ink border-line"
                      : "bg-paper text-accent border-line";
                  return (
                    <div className="border rounded-sm p-4 bg-surface">
                      <div className="flex items-center justify-between mb-3">
                        <div>
                          <span className="text-sm font-bold text-ink">Call quality</span>
                          <p className="text-xs text-muted mt-0.5">{label}</p>
                        </div>
                        <span className={`inline-flex items-center px-3 py-1 rounded-sm text-sm font-medium border tabular-nums ${badgeColor}`}>
                          {total}/{max}
                        </span>
                      </div>
                      <div className="space-y-1.5">
                        {criteria.map((c) => (
                          <div key={c.key} className="flex items-start gap-2 text-sm">
                            <span className={`mt-0.5 ${c.passed ? "text-ink" : "text-muted"}`}>
                              {c.passed ? "✓" : "✗"}
                            </span>
                            <div className="min-w-0">
                              <div className={c.passed ? "text-ink/80" : "text-muted"}>
                                {c.label}
                              </div>
                              {c.detail && (
                                <div className="text-xs text-muted">{c.detail}</div>
                              )}
                            </div>
                            {c.points > 1 && c.passed && (
                              <span className="ml-auto text-xs font-bold text-muted">+{c.points}</span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}

                {/* Call Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted font-bold uppercase">
                      Caller
                    </div>
                    <div className="font-bold text-ink">
                      {selectedCall.callerName || "Unknown"}
                    </div>
                    {selectedCall.callerPhone && (
                      <div className="text-sm text-muted">
                        {formatPhoneNumber(selectedCall.callerPhone)}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted font-bold uppercase">
                      Status
                    </div>
                    {selectedCall.appointment ? (
                      <span className="inline-flex items-center gap-1 text-ink font-bold">
                        <svg
                          width="14"
                          height="14"
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="3"
                        >
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                        Confirmed
                      </span>
                    ) : (
                      <span className="font-bold text-muted">
                        {selectedCall.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Extracted Data */}
                {selectedCall.extractedData && (
                  <div>
                    <div className="text-sm font-bold text-ink mb-2">
                      Extracted Information
                    </div>
                    <div className="bg-surface rounded-sm p-4 text-sm space-y-1">
                      {Object.entries(selectedCall.extractedData).map(
                        ([key, value]) =>
                          value && (
                            <div key={key} className="flex gap-2">
                              <span className="text-muted capitalize">
                                {key.replace(/([A-Z])/g, " $1").trim()}:
                              </span>
                              <span className="font-medium text-ink">
                                {value}
                              </span>
                            </div>
                          )
                      )}
                    </div>
                  </div>
                )}

                {/* Appointment */}
                {selectedCall.appointment && (
                  <div>
                    <div className="text-sm font-bold text-ink mb-2">
                      Appointment
                    </div>
                    <div className="bg-paper border border-line rounded-sm p-4 text-sm">
                      <div className="font-bold text-ink">
                        {selectedCall.appointment.petName} –{" "}
                        {selectedCall.appointment.serviceName}
                      </div>
                      <div className="text-ink mt-1">
                        {formatDateTime(selectedCall.appointment.startTime)}
                      </div>
                      <span className="inline-block mt-2 px-3 py-1 bg-paper text-ink text-xs font-bold rounded-sm">
                        {selectedCall.appointment.status}
                      </span>
                    </div>
                  </div>
                )}

                {/* Summary */}
                {selectedCall.summary && (
                  <div>
                    <div className="text-sm font-bold text-ink mb-2">
                      Summary
                    </div>
                    <p className="text-sm text-muted">
                      {selectedCall.summary}
                    </p>
                  </div>
                )}

                {/* Transcript */}
                {selectedCall.transcript && (
                  <div>
                    <div className="text-sm font-bold text-ink mb-2">
                      Transcript
                    </div>
                    <div className="bg-surface rounded-sm p-4 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto text-muted">
                      {selectedCall.transcript}
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
