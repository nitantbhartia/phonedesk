import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: No-show protection stats
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
  const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Get all appointments in the last 30 days
  const [
    totalAppointments,
    noShowCount,
    cancelledCount,
    confirmedCount,
    upcomingUnconfirmed,
    waitlistCount,
  ] = await Promise.all([
    prisma.appointment.count({
      where: {
        businessId: business.id,
        startTime: { gte: thirtyDaysAgo },
      },
    }),
    prisma.appointment.count({
      where: {
        businessId: business.id,
        status: "NO_SHOW",
        startTime: { gte: thirtyDaysAgo },
      },
    }),
    prisma.appointment.count({
      where: {
        businessId: business.id,
        status: "CANCELLED",
        startTime: { gte: thirtyDaysAgo },
      },
    }),
    prisma.appointment.count({
      where: {
        businessId: business.id,
        confirmedAt: { not: null },
        startTime: { gte: thirtyDaysAgo },
      },
    }),
    prisma.appointment.count({
      where: {
        businessId: business.id,
        status: "PENDING",
        startTime: { gte: now },
        confirmedAt: null,
      },
    }),
    prisma.waitlistEntry.count({
      where: {
        businessId: business.id,
        status: "WAITING",
      },
    }),
  ]);

  // Get repeat no-show offenders (customers with 2+ no-shows)
  const repeatOffenders = await prisma.appointment.groupBy({
    by: ["customerPhone"],
    where: {
      businessId: business.id,
      status: "NO_SHOW",
      customerPhone: { not: null },
    },
    _count: { id: true },
    having: {
      id: { _count: { gte: 2 } },
    },
  });

  // Get details for repeat offenders
  const offenderDetails = await Promise.all(
    repeatOffenders.map(async (offender: { customerPhone: string | null; _count: { id: number } }) => {
      const lastAppt = await prisma.appointment.findFirst({
        where: {
          businessId: business.id,
          customerPhone: offender.customerPhone!,
          status: "NO_SHOW",
        },
        orderBy: { startTime: "desc" },
        select: {
          customerName: true,
          customerPhone: true,
          petName: true,
          startTime: true,
        },
      });

      return {
        customerName: lastAppt?.customerName || "Unknown",
        customerPhone: offender.customerPhone,
        petName: lastAppt?.petName,
        noShowCount: offender._count.id,
        lastNoShow: lastAppt?.startTime,
      };
    })
  );

  // Calculate estimated revenue saved (based on avg service price)
  const avgServicePrice = await prisma.service.aggregate({
    where: { businessId: business.id, isActive: true },
    _avg: { price: true },
  });

  const avgPrice = avgServicePrice._avg.price || 75;
  const noShowRate = totalAppointments > 0 ? noShowCount / totalAppointments : 0;
  const estimatedSaved = confirmedCount * avgPrice * 0.15; // assume 15% would have been no-shows

  // Recent no-shows for the list
  const recentNoShows = await prisma.appointment.findMany({
    where: {
      businessId: business.id,
      status: "NO_SHOW",
    },
    orderBy: { startTime: "desc" },
    take: 10,
    select: {
      id: true,
      customerName: true,
      customerPhone: true,
      petName: true,
      serviceName: true,
      startTime: true,
      noShowMarkedAt: true,
    },
  });

  // Upcoming appointments needing confirmation
  const pendingConfirmation = await prisma.appointment.findMany({
    where: {
      businessId: business.id,
      status: { in: ["PENDING", "CONFIRMED"] },
      startTime: { gte: now },
      confirmedAt: null,
    },
    orderBy: { startTime: "asc" },
    take: 10,
    select: {
      id: true,
      customerName: true,
      customerPhone: true,
      petName: true,
      serviceName: true,
      startTime: true,
      status: true,
      reminder48hSent: true,
      reminderSent: true,
    },
  });

  // Lapsing clients: last completed appointment > rebookInterval (or 42 days) ago
  // and no future appointment scheduled
  const rebookingConfig = await prisma.rebookingConfig.findUnique({
    where: { businessId: business.id },
  });
  const defaultInterval = rebookingConfig?.defaultInterval || 42;
  const lapseThreshold = new Date(
    now.getTime() - defaultInterval * 24 * 60 * 60 * 1000
  );

  // Find customers whose last completed appointment is older than the threshold
  const completedAppointments = await prisma.appointment.findMany({
    where: {
      businessId: business.id,
      status: "COMPLETED",
      completedAt: { not: null, lte: lapseThreshold },
      customerPhone: { not: null },
    },
    orderBy: { completedAt: "desc" },
    select: {
      customerName: true,
      customerPhone: true,
      petName: true,
      completedAt: true,
      rebookInterval: true,
    },
  });

  // Group by customer phone, keep only the most recent completed appointment
  const customerLastVisit = new Map<
    string,
    {
      customerName: string;
      customerPhone: string;
      petName: string | null;
      lastVisitDate: Date;
      daysSinceVisit: number;
    }
  >();

  for (const appt of completedAppointments) {
    if (!appt.customerPhone) continue;
    if (customerLastVisit.has(appt.customerPhone)) continue; // already have most recent

    const interval = appt.rebookInterval || defaultInterval;
    const daysSince = Math.floor(
      (now.getTime() - appt.completedAt!.getTime()) / (24 * 60 * 60 * 1000)
    );

    if (daysSince < interval) continue; // not lapsed yet

    customerLastVisit.set(appt.customerPhone, {
      customerName: appt.customerName,
      customerPhone: appt.customerPhone,
      petName: appt.petName,
      lastVisitDate: appt.completedAt!,
      daysSinceVisit: daysSince,
    });
  }

  // Filter out customers who have a future appointment scheduled
  const lapsingCandidates = Array.from(customerLastVisit.values());
  const lapsingClients: typeof lapsingCandidates = [];

  for (const candidate of lapsingCandidates) {
    const futureAppt = await prisma.appointment.findFirst({
      where: {
        businessId: business.id,
        customerPhone: candidate.customerPhone,
        status: { in: ["PENDING", "CONFIRMED"] },
        startTime: { gte: now },
      },
    });

    if (!futureAppt) {
      lapsingClients.push(candidate);
    }
  }

  // Sort by days since visit descending
  lapsingClients.sort((a, b) => b.daysSinceVisit - a.daysSinceVisit);

  return NextResponse.json({
    stats: {
      totalAppointments,
      noShowCount,
      cancelledCount,
      confirmedCount,
      noShowRate: Math.round(noShowRate * 100),
      upcomingUnconfirmed,
      waitlistCount,
      estimatedSaved: Math.round(estimatedSaved),
    },
    repeatOffenders: offenderDetails,
    recentNoShows,
    pendingConfirmation,
    lapsingClients,
  });
}
