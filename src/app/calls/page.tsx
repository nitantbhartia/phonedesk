"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Phone,
  Calendar,
  Clock,
  MessageSquare,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
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

export default function CallLogPage() {
  const { status: authStatus } = useSession();
  const router = useRouter();
  const [calls, setCalls] = useState<CallRecord[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [filter, setFilter] = useState("all");
  const [selectedCall, setSelectedCall] = useState<CallRecord | null>(null);

  const pageSize = 20;

  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/");
      return;
    }
    if (authStatus === "authenticated") fetchCalls();
  }, [authStatus, router, page, filter]);

  async function fetchCalls() {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        limit: pageSize.toString(),
        offset: (page * pageSize).toString(),
      });
      if (filter !== "all") params.set("status", filter);

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

  const statusConfig: Record<string, { label: string; variant: "success" | "warning" | "destructive" | "outline" }> = {
    COMPLETED: { label: "Completed", variant: "outline" },
    NO_BOOKING: { label: "No Booking", variant: "warning" },
    MISSED: { label: "Missed", variant: "destructive" },
    FAILED: { label: "Failed", variant: "destructive" },
    IN_PROGRESS: { label: "In Progress", variant: "outline" },
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Call Log</h1>
        <p className="text-muted-foreground">
          All calls handled by your AI receptionist.
        </p>
      </div>

      <Tabs value={filter} onValueChange={(v) => { setFilter(v); setPage(0); }}>
        <TabsList>
          <TabsTrigger value="all">All Calls</TabsTrigger>
          <TabsTrigger value="COMPLETED">Booked</TabsTrigger>
          <TabsTrigger value="NO_BOOKING">No Booking</TabsTrigger>
          <TabsTrigger value="MISSED">Missed</TabsTrigger>
        </TabsList>
      </Tabs>

      <Card>
        <CardContent className="pt-6">
          {loading ? (
            <div className="space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 bg-slate-100 rounded-lg animate-pulse" />
              ))}
            </div>
          ) : calls.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Phone className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No calls found</p>
              <p className="text-sm">
                {filter !== "all"
                  ? "Try a different filter."
                  : "Calls will appear here once your AI starts answering."}
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {calls.map((call) => (
                <button
                  key={call.id}
                  onClick={() => setSelectedCall(call)}
                  className="w-full flex items-center gap-4 p-4 rounded-lg border hover:bg-slate-50 transition-colors text-left"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 ${
                      call.appointment
                        ? "bg-green-100 text-green-600"
                        : call.status === "NO_BOOKING"
                          ? "bg-yellow-100 text-yellow-600"
                          : "bg-red-100 text-red-600"
                    }`}
                  >
                    {call.appointment ? (
                      <Calendar className="w-4 h-4" />
                    ) : (
                      <Phone className="w-4 h-4" />
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">
                        {call.callerName || "Unknown Caller"}
                      </span>
                      {call.callerPhone && (
                        <span className="text-xs text-muted-foreground">
                          {formatPhoneNumber(call.callerPhone)}
                        </span>
                      )}
                      {call.appointment ? (
                        <Badge variant="success">Booked</Badge>
                      ) : (
                        <Badge
                          variant={
                            statusConfig[call.status]?.variant || "outline"
                          }
                        >
                          {statusConfig[call.status]?.label || call.status}
                        </Badge>
                      )}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {call.summary ||
                        (call.appointment
                          ? `${call.appointment.petName} - ${call.appointment.serviceName} on ${formatDateTime(call.appointment.startTime)}`
                          : "No summary")}
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="text-xs text-muted-foreground">
                      {formatDateTime(call.createdAt)}
                    </div>
                    {call.duration != null && (
                      <div className="text-xs text-muted-foreground flex items-center gap-1 justify-end mt-0.5">
                        <Clock className="w-3 h-3" />
                        {formatDuration(call.duration)}
                      </div>
                    )}
                  </div>
                </button>
              ))}
            </div>
          )}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex items-center justify-between pt-4 mt-4 border-t">
              <div className="text-sm text-muted-foreground">
                {page * pageSize + 1}–{Math.min((page + 1) * pageSize, total)} of {total}
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page - 1)}
                  disabled={page === 0}
                >
                  <ChevronLeft className="w-4 h-4" />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage(page + 1)}
                  disabled={page >= totalPages - 1}
                >
                  <ChevronRight className="w-4 h-4" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Call Detail Dialog */}
      <Dialog
        open={!!selectedCall}
        onOpenChange={() => setSelectedCall(null)}
      >
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          {selectedCall && (
            <>
              <DialogHeader>
                <DialogTitle>
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
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground">Caller</div>
                    <div className="font-medium">
                      {selectedCall.callerName || "Unknown"}
                    </div>
                    {selectedCall.callerPhone && (
                      <div className="text-sm text-muted-foreground">
                        {formatPhoneNumber(selectedCall.callerPhone)}
                      </div>
                    )}
                  </div>
                  <div>
                    <div className="text-xs text-muted-foreground">Status</div>
                    <Badge
                      variant={
                        selectedCall.appointment
                          ? "success"
                          : statusConfig[selectedCall.status]?.variant || "outline"
                      }
                    >
                      {selectedCall.appointment
                        ? "Booked"
                        : statusConfig[selectedCall.status]?.label || selectedCall.status}
                    </Badge>
                  </div>
                </div>

                {/* Extracted Data */}
                {selectedCall.extractedData && (
                  <div>
                    <div className="text-sm font-medium mb-2">
                      Extracted Information
                    </div>
                    <div className="bg-slate-50 rounded-lg p-3 text-sm space-y-1">
                      {Object.entries(selectedCall.extractedData).map(
                        ([key, value]) =>
                          value && (
                            <div key={key} className="flex gap-2">
                              <span className="text-muted-foreground capitalize">
                                {key.replace(/([A-Z])/g, " $1").trim()}:
                              </span>
                              <span>{value}</span>
                            </div>
                          )
                      )}
                    </div>
                  </div>
                )}

                {/* Appointment */}
                {selectedCall.appointment && (
                  <div>
                    <div className="text-sm font-medium mb-2">Appointment</div>
                    <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-sm">
                      <div>
                        {selectedCall.appointment.petName} -{" "}
                        {selectedCall.appointment.serviceName}
                      </div>
                      <div className="text-green-700">
                        {formatDateTime(selectedCall.appointment.startTime)}
                      </div>
                      <Badge variant="success" className="mt-2">
                        {selectedCall.appointment.status}
                      </Badge>
                    </div>
                  </div>
                )}

                {/* Summary */}
                {selectedCall.summary && (
                  <div>
                    <div className="text-sm font-medium mb-2">Summary</div>
                    <p className="text-sm text-muted-foreground">
                      {selectedCall.summary}
                    </p>
                  </div>
                )}

                {/* Transcript */}
                {selectedCall.transcript && (
                  <div>
                    <div className="text-sm font-medium mb-2 flex items-center gap-2">
                      <MessageSquare className="w-4 h-4" />
                      Transcript
                    </div>
                    <div className="bg-slate-50 rounded-lg p-4 text-sm whitespace-pre-wrap max-h-64 overflow-y-auto">
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
