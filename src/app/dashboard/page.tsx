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
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Phone,
  Calendar,
  DollarSign,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  PhoneIncoming,
  ArrowRight,
} from "lucide-react";
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
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-32 bg-slate-200 rounded-lg animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Dashboard</h1>
        <p className="text-muted-foreground">
          Welcome back{session?.user?.name ? `, ${session.user.name}` : ""}
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Calls This Week"
          value={stats.callsThisWeek}
          icon={<PhoneIncoming className="w-4 h-4" />}
          color="blue"
        />
        <StatCard
          title="Bookings Confirmed"
          value={stats.bookingsConfirmed}
          icon={<CheckCircle className="w-4 h-4" />}
          color="green"
        />
        <StatCard
          title="Missed (No Booking)"
          value={stats.bookingsMissed}
          icon={<XCircle className="w-4 h-4" />}
          color="red"
        />
        <StatCard
          title="Revenue Protected"
          value={`$${stats.revenueProtected.toLocaleString()}`}
          icon={<DollarSign className="w-4 h-4" />}
          color="emerald"
          subtitle="Based on avg service price"
        />
      </div>

      {/* Secondary stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Phone className="w-4 h-4 text-muted-foreground" />
              Calls This Month
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">{stats.callsThisMonth}</div>
            <div className="flex items-center gap-1 text-sm text-green-600 mt-1">
              <TrendingUp className="w-3 h-3" />
              <span>Active and answering</span>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-medium flex items-center gap-2">
              <Clock className="w-4 h-4 text-muted-foreground" />
              Avg Call Duration
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-3xl font-bold">
              {stats.avgCallDuration
                ? `${Math.floor(stats.avgCallDuration / 60)}:${(stats.avgCallDuration % 60).toString().padStart(2, "0")}`
                : "0:00"}
            </div>
            <div className="text-sm text-muted-foreground mt-1">
              Target: under 2 minutes
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent Calls */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Recent Calls</CardTitle>
              <CardDescription>Last 10 calls handled by RingPaw</CardDescription>
            </div>
            <Link href="/calls">
              <Button variant="outline" size="sm">
                View All <ArrowRight className="ml-2 w-3 h-3" />
              </Button>
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentCalls.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Phone className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p className="font-medium">No calls yet</p>
              <p className="text-sm">
                Calls will appear here once your AI receptionist starts
                answering.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {recentCalls.map((call) => (
                <div
                  key={call.id}
                  className="flex items-center gap-4 p-3 rounded-lg border hover:bg-slate-50 transition-colors"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      call.appointment
                        ? "bg-green-100 text-green-600"
                        : call.status === "COMPLETED"
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
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">
                        {call.callerName || call.callerPhone || "Unknown"}
                      </span>
                      <Badge
                        variant={
                          call.appointment
                            ? "success"
                            : call.status === "COMPLETED"
                              ? "warning"
                              : "destructive"
                        }
                      >
                        {call.appointment ? "Booked" : call.status === "COMPLETED" ? "No Booking" : call.status}
                      </Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {call.summary ||
                        (call.appointment
                          ? `${call.appointment.petName} - ${call.appointment.serviceName}`
                          : "No summary available")}
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="text-xs text-muted-foreground">
                      {new Date(call.createdAt).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                      })}
                    </div>
                    {call.duration && (
                      <div className="text-xs text-muted-foreground">
                        {Math.floor(call.duration / 60)}:
                        {(call.duration % 60).toString().padStart(2, "0")}
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  icon,
  color,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  color: string;
  subtitle?: string;
}) {
  const colorMap: Record<string, string> = {
    blue: "bg-blue-100 text-blue-600",
    green: "bg-green-100 text-green-600",
    red: "bg-red-100 text-red-600",
    emerald: "bg-emerald-100 text-emerald-600",
  };

  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex items-center gap-3">
          <div
            className={`w-10 h-10 rounded-lg flex items-center justify-center ${colorMap[color] || colorMap.blue}`}
          >
            {icon}
          </div>
          <div>
            <div className="text-sm text-muted-foreground">{title}</div>
            <div className="text-2xl font-bold">{value}</div>
            {subtitle && (
              <div className="text-xs text-muted-foreground">{subtitle}</div>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
