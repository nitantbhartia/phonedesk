import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
  });
  if (!business) {
    return NextResponse.json({ error: "No business" }, { status: 404 });
  }

  const now = new Date();
  // Last 6 complete months + current partial month = 7 data points
  const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  const rebookingConfig = await prisma.rebookingConfig.findUnique({
    where: { businessId: business.id },
  });
  const defaultInterval = rebookingConfig?.defaultInterval ?? 42;
  const lapseThreshold = new Date(
    now.getTime() - defaultInterval * 24 * 60 * 60 * 1000
  );

  // All completed appointments in last 6 months
  const completedAppts = await prisma.appointment.findMany({
    where: {
      businessId: business.id,
      status: "COMPLETED",
      startTime: { gte: sixMonthsAgo },
      isTestBooking: false,
    },
    select: {
      servicePrice: true,
      serviceName: true,
      startTime: true,
      customerPhone: true,
      customerName: true,
    },
  });

  // --- Revenue by month ---
  const monthMap = new Map<string, number>();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    monthMap.set(key, 0);
  }
  for (const appt of completedAppts) {
    const d = appt.startTime;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    if (monthMap.has(key)) {
      monthMap.set(key, (monthMap.get(key) ?? 0) + (appt.servicePrice ?? 0));
    }
  }
  const revenueByMonth = Array.from(monthMap.entries()).map(([month, revenue]) => ({
    month,
    revenue: Math.round(revenue),
  }));

  // --- Revenue by service ---
  const serviceMap = new Map<string, { revenue: number; count: number }>();
  for (const appt of completedAppts) {
    const name = appt.serviceName ?? "Other";
    const prev = serviceMap.get(name) ?? { revenue: 0, count: 0 };
    serviceMap.set(name, {
      revenue: prev.revenue + (appt.servicePrice ?? 0),
      count: prev.count + 1,
    });
  }
  const revenueByService = Array.from(serviceMap.entries())
    .map(([service, data]) => ({
      service,
      revenue: Math.round(data.revenue),
      count: data.count,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  // --- Revenue by day of week ---
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayMap = new Map<number, number>(dayNames.map((_, i) => [i, 0]));
  for (const appt of completedAppts) {
    const day = appt.startTime.getDay();
    dayMap.set(day, (dayMap.get(day) ?? 0) + (appt.servicePrice ?? 0));
  }
  const revenueByDay = dayNames.map((name, i) => ({
    day: name,
    revenue: Math.round(dayMap.get(i) ?? 0),
  }));

  // --- Customer LTV ---
  const customerMap = new Map<
    string,
    { name: string; revenue: number; visits: number; lastVisit: Date }
  >();
  // Use all-time completed appointments for LTV
  const allCompleted = await prisma.appointment.findMany({
    where: {
      businessId: business.id,
      status: "COMPLETED",
      customerPhone: { not: null },
      isTestBooking: false,
    },
    select: {
      customerPhone: true,
      customerName: true,
      servicePrice: true,
      startTime: true,
    },
  });
  for (const appt of allCompleted) {
    const phone = appt.customerPhone!;
    const prev = customerMap.get(phone) ?? {
      name: appt.customerName,
      revenue: 0,
      visits: 0,
      lastVisit: appt.startTime,
    };
    customerMap.set(phone, {
      name: prev.name,
      revenue: prev.revenue + (appt.servicePrice ?? 0),
      visits: prev.visits + 1,
      lastVisit:
        appt.startTime > prev.lastVisit ? appt.startTime : prev.lastVisit,
    });
  }
  const customerLtv = Array.from(customerMap.entries())
    .map(([phone, data]) => ({
      phone,
      name: data.name,
      revenue: Math.round(data.revenue),
      visits: data.visits,
      lastVisit: data.lastVisit.toISOString(),
      avgPerVisit:
        data.visits > 0 ? Math.round(data.revenue / data.visits) : 0,
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const vipCustomers = customerLtv.slice(0, 10);

  // --- At-risk / lapsing customers ---
  const lapsedPhones = new Set<string>();
  const lapsedMap = new Map<
    string,
    { name: string; lastVisit: Date; daysSince: number }
  >();
  for (const [phone, data] of customerMap.entries()) {
    const daysSince = Math.floor(
      (now.getTime() - data.lastVisit.getTime()) / (24 * 60 * 60 * 1000)
    );
    if (daysSince >= defaultInterval) {
      lapsedPhones.add(phone);
      lapsedMap.set(phone, {
        name: data.name,
        lastVisit: data.lastVisit,
        daysSince,
      });
    }
  }
  // Exclude customers who have a future appointment
  const futureAppts = await prisma.appointment.findMany({
    where: {
      businessId: business.id,
      status: { in: ["PENDING", "CONFIRMED"] },
      startTime: { gte: now },
      customerPhone: { in: Array.from(lapsedPhones) },
    },
    select: { customerPhone: true },
  });
  for (const fa of futureAppts) {
    if (fa.customerPhone) lapsedPhones.delete(fa.customerPhone);
  }

  const atRiskCustomers = Array.from(lapsedPhones)
    .map((phone) => {
      const data = lapsedMap.get(phone)!;
      const ltv = customerMap.get(phone);
      return {
        phone,
        name: data.name,
        lastVisit: data.lastVisit.toISOString(),
        daysSince: data.daysSince,
        revenue: ltv ? Math.round(ltv.revenue) : 0,
        visits: ltv?.visits ?? 0,
      };
    })
    .sort((a, b) => b.daysSince - a.daysSince)
    .slice(0, 20);

  // --- Summary KPIs ---
  const totalRevenue6mo = completedAppts.reduce(
    (sum, a) => sum + (a.servicePrice ?? 0),
    0
  );
  const currentMonth = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const revenueThisMonth = revenueByMonth.find((r) => r.month === currentMonth)?.revenue ?? 0;
  const lastMonthKey = (() => {
    const d = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  })();
  const revenueLastMonth = revenueByMonth.find((r) => r.month === lastMonthKey)?.revenue ?? 0;

  return NextResponse.json({
    summary: {
      totalRevenue6mo: Math.round(totalRevenue6mo),
      revenueThisMonth,
      revenueLastMonth,
      totalCustomers: customerMap.size,
      atRiskCount: atRiskCustomers.length,
      topService: revenueByService[0]?.service ?? null,
    },
    revenueByMonth,
    revenueByService,
    revenueByDay,
    vipCustomers,
    atRiskCustomers,
  });
}
