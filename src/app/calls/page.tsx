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
import { formatPhoneNumber, formatDuration, formatDateTime } from "@/lib/utils";

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

  const pageSize = 20;

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/");
      return;
    }
    if (authStatus === "authenticated") fetchCalls();
  }, [authStatus, router, page, filter, search]);

  async function fetchCalls() {
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
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }

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
          <h1 className="text-4xl font-extrabold text-paw-brown">Call Log</h1>
          <p className="text-paw-brown/60 font-medium mt-1">
            Review and manage recent AI interactions
          </p>
        </div>
        <div className="flex gap-3">
          <button className="px-5 py-2.5 bg-white rounded-full font-bold text-sm shadow-sm border border-paw-brown/5 flex items-center gap-2 hover:bg-paw-cream transition-colors">
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
            Export
          </button>
        </div>
      </div>

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
            className="absolute left-4 top-1/2 -translate-y-1/2 text-paw-brown/30 pointer-events-none"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <input
            type="text"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            placeholder="Search by name, phone, or transcript…"
            className="w-full pl-10 pr-4 py-2.5 bg-white rounded-full border border-paw-brown/10 text-sm font-medium focus:outline-none focus:border-paw-amber transition-all"
          />
        </div>
        <button
          type="submit"
          className="px-5 py-2.5 bg-paw-brown text-white rounded-full font-bold text-sm hover:bg-opacity-90 transition-colors"
        >
          Search
        </button>
        {search && (
          <button
            type="button"
            onClick={() => { setSearch(""); setSearchInput(""); setPage(0); }}
            className="px-4 py-2.5 bg-white rounded-full font-bold text-sm border border-paw-brown/10 hover:bg-paw-cream transition-colors text-paw-brown/60"
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
            className={`px-5 py-2 rounded-full text-sm font-bold transition-all ${
              filter === f.value
                ? "bg-paw-brown text-white shadow-sm"
                : "bg-white text-paw-brown/60 hover:bg-paw-cream border border-paw-brown/5"
            }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {/* Table */}
      <div className="bg-white rounded-4xl shadow-soft overflow-hidden border border-white">
        {loading ? (
          <div className="p-8 space-y-4">
            {[1, 2, 3, 4, 5].map((i) => (
              <div
                key={i}
                className="h-16 bg-paw-cream/50 rounded-2xl animate-pulse"
              />
            ))}
          </div>
        ) : calls.length === 0 ? (
          <div className="text-center py-20 text-paw-brown/50">
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
            <p className="font-bold text-lg">No calls found</p>
            <p className="text-sm mt-1">
              {filter !== "all"
                ? "Try a different filter."
                : "Calls will appear here once your AI starts answering."}
            </p>
          </div>
        ) : (
          <table className="w-full text-left">
            <thead className="bg-paw-cream/50 border-b border-paw-brown/5">
              <tr>
                <th className="px-4 sm:px-8 py-5 text-xs font-bold text-paw-brown/40 uppercase tracking-wider">
                  Caller &amp; Pet
                </th>
                <th className="px-4 sm:px-6 py-5 text-xs font-bold text-paw-brown/40 uppercase tracking-wider hidden sm:table-cell">
                  Service
                </th>
                <th className="px-4 sm:px-6 py-5 text-xs font-bold text-paw-brown/40 uppercase tracking-wider hidden sm:table-cell">
                  Status
                </th>
                <th className="px-4 sm:px-6 py-5 text-xs font-bold text-paw-brown/40 uppercase tracking-wider hidden md:table-cell">
                  Duration
                </th>
                <th className="px-4 sm:px-6 py-5 text-xs font-bold text-paw-brown/40 uppercase tracking-wider hidden md:table-cell">
                  Time
                </th>
                <th className="px-4 sm:px-8 py-5 text-xs font-bold text-paw-brown/40 uppercase tracking-wider text-right">
                  Action
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-paw-brown/5">
              {calls.map((call) => {
                const displayName =
                  call.callerName || "Unknown Caller";
                const initials =
                  call.callerName
                    ? getInitials(call.callerName)
                    : "?";
                const bgColors = [
                  "bg-paw-sky",
                  "bg-paw-orange/20",
                  "bg-paw-amber/30",
                  "bg-gray-100",
                ];
                const bgColor =
                  call.callerName
                    ? bgColors[
                        displayName.charCodeAt(0) % bgColors.length
                      ]
                    : "bg-gray-100";
                const textColor =
                  call.callerName
                    ? "text-paw-brown"
                    : "text-gray-400";

                return (
                  <tr
                    key={call.id}
                    className="hover:bg-paw-cream/30 transition-colors"
                  >
                    <td className="px-4 sm:px-8 py-4 sm:py-6">
                      <div className="flex items-center gap-3">
                        <div
                          className={`w-10 h-10 rounded-full ${bgColor} flex items-center justify-center font-bold ${textColor} shrink-0`}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <p className="font-bold text-paw-brown truncate">
                            {displayName}
                          </p>
                          <p className="text-sm text-paw-brown/50 truncate">
                            {call.appointment?.petName
                              ? `${call.appointment.petName}`
                              : call.callerPhone
                                ? formatPhoneNumber(call.callerPhone)
                                : "No details"}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-4 sm:px-6 py-4 sm:py-6 hidden sm:table-cell">
                      {call.appointment?.serviceName ? (
                        <span className="px-3 py-1 bg-paw-amber/20 text-paw-brown text-xs font-bold rounded-full">
                          {call.appointment.serviceName}
                        </span>
                      ) : (
                        <span className="text-sm text-paw-brown/40 italic">
                          Inquiry Only
                        </span>
                      )}
                    </td>
                    <td className="px-4 sm:px-6 py-4 sm:py-6 hidden sm:table-cell">
                      {call.appointment ? (
                        <div className="flex items-center gap-2 text-emerald-600">
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
                        <div className="flex items-center gap-2 text-paw-orange">
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
                        <div className="flex items-center gap-2 text-paw-brown/30">
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
                    <td className="px-4 sm:px-6 py-4 sm:py-6 text-sm font-medium text-paw-brown/70 hidden md:table-cell">
                      {call.duration != null
                        ? formatDuration(call.duration)
                        : "--"}
                    </td>
                    <td className="px-4 sm:px-6 py-4 sm:py-6 text-sm font-medium text-paw-brown/70 hidden md:table-cell">
                      {formatDateTime(call.createdAt)}
                    </td>
                    <td className="px-4 sm:px-8 py-4 sm:py-6 text-right">
                      <button
                        onClick={() => setSelectedCall(call)}
                        className="text-paw-orange font-bold text-sm hover:underline"
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
          <div className="px-8 py-5 bg-paw-cream/20 flex justify-between items-center border-t border-paw-brown/5">
            <p className="text-sm font-medium text-paw-brown/50">
              Showing {page * pageSize + 1}–
              {Math.min((page + 1) * pageSize, total)} of {total} calls
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setPage(page - 1)}
                disabled={page === 0}
                className="p-2 rounded-lg border border-paw-brown/10 hover:bg-white transition-colors disabled:opacity-30"
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
                className="p-2 rounded-lg border border-paw-brown/10 hover:bg-white transition-colors disabled:opacity-30"
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
                <DialogTitle className="text-paw-brown">
                  Call from {selectedCall.callerName || "Unknown"}
                </DialogTitle>
                <DialogDescription>
                  {formatDateTime(selectedCall.createdAt)}
                  {selectedCall.duration != null &&
                    ` | Duration: ${formatDuration(selectedCall.duration)}`}
                </DialogDescription>
              </DialogHeader>

              <div className="space-y-4">
                {/* Call Info */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-paw-brown/50 font-bold uppercase">
                      Caller
                    </div>
                    <div className="font-bold text-paw-brown">
                      {selectedCall.callerName || "Unknown"}
                    </div>
                    {selectedCall.callerPhone && (
                      <div className="text-sm text-paw-brown/50">
                        {formatPhoneNumber(selectedCall.callerPhone)}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-paw-brown/50 font-bold uppercase">
                      Status
                    </div>
                    {selectedCall.appointment ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 font-bold">
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
                      <span className="font-bold text-paw-brown/60">
                        {selectedCall.status}
                      </span>
                    )}
                  </div>
                </div>

                {/* Extracted Data */}
                {selectedCall.extractedData && (
                  <div>
                    <div className="text-sm font-bold text-paw-brown mb-2">
                      Extracted Information
                    </div>
                    <div className="bg-paw-cream rounded-2xl p-4 text-sm space-y-1">
                      {Object.entries(selectedCall.extractedData).map(
                        ([key, value]) =>
                          value && (
                            <div key={key} className="flex gap-2">
                              <span className="text-paw-brown/50 capitalize">
                                {key.replace(/([A-Z])/g, " $1").trim()}:
                              </span>
                              <span className="font-medium text-paw-brown">
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
                    <div className="text-sm font-bold text-paw-brown mb-2">
                      Appointment
                    </div>
                    <div className="bg-green-50 border border-green-200 rounded-2xl p-4 text-sm">
                      <div className="font-bold text-paw-brown">
                        {selectedCall.appointment.petName} –{" "}
                        {selectedCall.appointment.serviceName}
                      </div>
                      <div className="text-green-700 mt-1">
                        {formatDateTime(selectedCall.appointment.startTime)}
                      </div>
                      <span className="inline-block mt-2 px-3 py-1 bg-green-100 text-green-700 text-xs font-bold rounded-full">
                        {selectedCall.appointment.status}
                      </span>
                    </div>
                  </div>
                )}

                {/* Summary */}
                {selectedCall.summary && (
                  <div>
                    <div className="text-sm font-bold text-paw-brown mb-2">
                      Summary
                    </div>
                    <p className="text-sm text-paw-brown/60">
                      {selectedCall.summary}
                    </p>
                  </div>
                )}

                {/* Transcript */}
                {selectedCall.transcript && (
                  <div>
                    <div className="text-sm font-bold text-paw-brown mb-2">
                      Transcript
                    </div>
                    <div className="bg-paw-cream rounded-2xl p-4 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto text-paw-brown/70">
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
