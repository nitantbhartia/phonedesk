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
    repeatOffenders.map(async (offender) => {
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
  });
}
