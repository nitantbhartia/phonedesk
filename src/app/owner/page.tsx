import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { type ReactNode } from "react";
import { Building2, CalendarCheck2, MessageSquare, PhoneCall, Users } from "lucide-react";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isOwnerDashboardEmail } from "@/lib/owner-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

function startOfDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export default async function OwnerDashboardPage() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email || null;

  if (!session?.user?.id || !isOwnerDashboardEmail(email)) {
    redirect("/dashboard");
  }

  const now = new Date();
  const weekStart = startOfDay(new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000));
  const monthStart = startOfDay(new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000));

  const [
    businesses,
    totalCalls,
    calls7d,
    calls30d,
    appointments,
    customersTotal,
    smsInbound,
    smsOutbound,
    callStatusCounts,
    appointmentStatusCounts,
    businessCallCounts30d,
    businessSmsCounts30d,
  ] = await Promise.all([
    prisma.business.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        id: true,
        name: true,
        ownerName: true,
        email: true,
        plan: true,
        isActive: true,
        createdAt: true,
        phoneNumber: { select: { number: true } },
        _count: {
          select: {
            calls: true,
            appointments: true,
            customers: true,
            waitlistEntries: true,
            reviewRequests: true,
          },
        },
      },
    }),
    prisma.call.count(),
    prisma.call.count({ where: { createdAt: { gte: weekStart } } }),
    prisma.call.count({ where: { createdAt: { gte: monthStart } } }),
    prisma.appointment.count(),
    prisma.customer.count(),
    prisma.smsLog.count({ where: { direction: "INBOUND" } }),
    prisma.smsLog.count({ where: { direction: "OUTBOUND" } }),
    prisma.call.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.appointment.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
    prisma.call.groupBy({
      by: ["businessId"],
      where: { createdAt: { gte: monthStart } },
      _count: { _all: true },
      _avg: { duration: true },
    }),
    prisma.smsLog.groupBy({
      by: ["businessId"],
      where: {
        createdAt: { gte: monthStart },
        businessId: { not: null },
      },
      _count: { _all: true },
    }),
  ]);

  const activeBusinesses = businesses.filter((b) => b.isActive).length;
  const withPhoneNumber = businesses.filter((b) => b.phoneNumber?.number).length;
  const callsByStatus = Object.fromEntries(
    callStatusCounts.map((row) => [row.status, row._count._all])
  );
  const appointmentsByStatus = Object.fromEntries(
    appointmentStatusCounts.map((row) => [row.status, row._count._all])
  );
  const callCountMap30d = new Map(
    businessCallCounts30d.map((row) => [
      row.businessId,
      { calls: row._count._all, avgDuration: Math.round(row._avg.duration ?? 0) },
    ])
  );
  const smsCountMap30d = new Map(
    businessSmsCounts30d.map((row) => [row.businessId || "", row._count._all])
  );

  const topBusinesses = businesses
    .map((business) => {
      const call30d = callCountMap30d.get(business.id);
      return {
        ...business,
        calls30d: call30d?.calls ?? 0,
        avgDuration30d: call30d?.avgDuration ?? 0,
        sms30d: smsCountMap30d.get(business.id) ?? 0,
      };
    })
    .sort((a, b) => b.calls30d - a.calls30d)
    .slice(0, 20);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Owner Dashboard</h1>
        <p className="text-muted-foreground">
          Cross-account analytics across all groomers using RingPaw.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard
          title="Businesses"
          value={`${businesses.length}`}
          subtitle={`${activeBusinesses} active / ${withPhoneNumber} with number`}
          icon={<Building2 className="w-4 h-4" />}
        />
        <StatCard
          title="Calls"
          value={`${totalCalls}`}
          subtitle={`${calls7d} last 7d · ${calls30d} last 30d`}
          icon={<PhoneCall className="w-4 h-4" />}
        />
        <StatCard
          title="Appointments"
          value={`${appointments}`}
          subtitle={`${appointmentsByStatus.CONFIRMED ?? 0} confirmed · ${appointmentsByStatus.CANCELLED ?? 0} cancelled`}
          icon={<CalendarCheck2 className="w-4 h-4" />}
        />
        <StatCard
          title="Customers + SMS"
          value={`${customersTotal}`}
          subtitle={`${smsInbound} inbound / ${smsOutbound} outbound`}
          icon={<Users className="w-4 h-4" />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle>Call Outcomes</CardTitle>
            <CardDescription>Global distribution of call statuses</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.keys(callsByStatus).length === 0 ? (
              <p className="text-sm text-muted-foreground">No calls yet.</p>
            ) : (
              Object.entries(callsByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <span>{status}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Appointment Outcomes</CardTitle>
            <CardDescription>Global booking status mix</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {Object.keys(appointmentsByStatus).length === 0 ? (
              <p className="text-sm text-muted-foreground">No appointments yet.</p>
            ) : (
              Object.entries(appointmentsByStatus).map(([status, count]) => (
                <div key={status} className="flex items-center justify-between text-sm">
                  <span>{status}</span>
                  <Badge variant="secondary">{count}</Badge>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Top Groomers by Calls (30d)</CardTitle>
          <CardDescription>
            Highest call volume in the last 30 days, with booking and messaging context.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {topBusinesses.length === 0 ? (
            <p className="text-sm text-muted-foreground">No business data yet.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground">
                    <th className="text-left py-2 pr-3">Business</th>
                    <th className="text-left py-2 pr-3">Plan</th>
                    <th className="text-right py-2 pr-3">Calls (30d)</th>
                    <th className="text-right py-2 pr-3">Avg Duration</th>
                    <th className="text-right py-2 pr-3">Appointments</th>
                    <th className="text-right py-2 pr-3">Customers</th>
                    <th className="text-right py-2 pr-3">SMS (30d)</th>
                    <th className="text-right py-2">Waitlist</th>
                  </tr>
                </thead>
                <tbody>
                  {topBusinesses.map((business) => (
                    <tr key={business.id} className="border-b last:border-0">
                      <td className="py-2 pr-3">
                        <div className="font-medium">{business.name}</div>
                        <div className="text-xs text-muted-foreground">
                          {business.ownerName}
                          {business.phoneNumber?.number ? ` · ${business.phoneNumber.number}` : ""}
                        </div>
                      </td>
                      <td className="py-2 pr-3">
                        <Badge variant="outline">{business.plan}</Badge>
                      </td>
                      <td className="py-2 pr-3 text-right">{business.calls30d}</td>
                      <td className="py-2 pr-3 text-right">
                        {business.avgDuration30d > 0
                          ? `${Math.floor(business.avgDuration30d / 60)}:${(business.avgDuration30d % 60)
                              .toString()
                              .padStart(2, "0")}`
                          : "0:00"}
                      </td>
                      <td className="py-2 pr-3 text-right">{business._count.appointments}</td>
                      <td className="py-2 pr-3 text-right">{business._count.customers}</td>
                      <td className="py-2 pr-3 text-right">{business.sms30d}</td>
                      <td className="py-2 text-right">{business._count.waitlistEntries}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-4 h-4" />
            Notes
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-1">
          <p>- This view is owner-only and controlled by `OWNER_DASHBOARD_EMAILS`.</p>
          <p>- Add `NEXT_PUBLIC_OWNER_DASHBOARD_EMAILS` to show the sidebar link in UI.</p>
          <p>- Metrics are live from production tables and update as calls/SMS/bookings arrive.</p>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({
  title,
  value,
  subtitle,
  icon,
}: {
  title: string;
  value: string;
  subtitle: string;
  icon: ReactNode;
}) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium flex items-center gap-2">
          {icon}
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="text-3xl font-bold">{value}</div>
        <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
      </CardContent>
    </Card>
  );
}
