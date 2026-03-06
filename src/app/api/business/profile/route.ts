import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncRetellAgent } from "@/lib/retell";

async function resolveUserId(session: {
  user?: { id?: string | null; email?: string | null; name?: string | null; image?: string | null };
}) {
  const email = session.user?.email;

  if (!email) {
    return session.user?.id ?? null;
  }

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: session.user?.name ?? undefined,
      image: session.user?.image ?? undefined,
    },
    update: {
      name: session.user?.name ?? undefined,
      image: session.user?.image ?? undefined,
    },
  });

  return user.id;
}

export async function GET() {
  const session = await getServerSession(authOptions);
  const userId = session ? await resolveUserId(session) : null;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId },
    include: {
      services: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      phoneNumber: true,
      calendarConnections: { where: { isActive: true } },
      retellConfig: true,
    },
  });

  if (!business) {
    return NextResponse.json({ business: null, stats: null });
  }

  // Compute dashboard stats
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [callsThisWeek, callsThisMonth, bookingsConfirmed, bookingsMissed, avgDuration] =
    await Promise.all([
      prisma.call.count({
        where: { businessId: business.id, createdAt: { gte: weekAgo } },
      }),
      prisma.call.count({
        where: { businessId: business.id, createdAt: { gte: monthAgo } },
      }),
      prisma.appointment.count({
        where: {
          businessId: business.id,
          status: { in: ["CONFIRMED", "PENDING"] },
          createdAt: { gte: monthAgo },
        },
      }),
      prisma.call.count({
        where: {
          businessId: business.id,
          status: "NO_BOOKING",
          createdAt: { gte: monthAgo },
        },
      }),
      prisma.call.aggregate({
        where: { businessId: business.id, duration: { not: null } },
        _avg: { duration: true },
      }),
    ]);

  // Estimate revenue protected
  const avgServicePrice =
    business.services.length > 0
      ? business.services.reduce((sum, s) => sum + s.price, 0) / business.services.length
      : 65;

  const stats = {
    callsThisWeek,
    callsThisMonth,
    bookingsConfirmed,
    bookingsMissed,
    revenueProtected: Math.round(bookingsConfirmed * avgServicePrice),
    avgCallDuration: Math.round(avgDuration._avg.duration || 0),
  };

  return NextResponse.json({ business, stats });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session ? await resolveUserId(session) : null;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const {
    name,
    ownerName,
    city,
    state,
    phone,
    address,
    timezone,
    businessHours,
    bookingMode,
    services,
  } = body;

  // Upsert business
  const business = await prisma.business.upsert({
    where: { userId },
    create: {
      userId,
      name,
      ownerName,
      city,
      state,
      phone,
      address,
      timezone: timezone || "America/Los_Angeles",
      businessHours,
      bookingMode: bookingMode || "SOFT",
      onboardingStep: 3,
    },
    update: {
      name,
      ownerName,
      city,
      state,
      phone,
      address,
      timezone: timezone || "America/Los_Angeles",
      businessHours,
      bookingMode: bookingMode || "SOFT",
      onboardingStep: 3,
    },
  });

  // Upsert services
  if (services && Array.isArray(services)) {
    // Deactivate existing services
    await prisma.service.updateMany({
      where: { businessId: business.id },
      data: { isActive: false },
    });

    // Create new services
    for (const svc of services) {
      if (svc.name?.trim()) {
        await prisma.service.create({
          data: {
            businessId: business.id,
            name: svc.name.trim(),
            price: parseFloat(svc.price) || 0,
            duration: parseInt(svc.duration) || 60,
          },
        });
      }
    }
  }

  // Create/update Retell config
  const fullBusiness = await prisma.business.findUnique({
    where: { id: business.id },
    include: {
      services: { where: { isActive: true } },
      retellConfig: true,
    },
  });

  if (fullBusiness) {
    try {
      await syncRetellAgent(fullBusiness);
    } catch (error) {
      console.error("Error configuring Retell:", error);
    }
  }

  return NextResponse.json({ business });
}

export async function PATCH(req: NextRequest) {
  const session = await getServerSession(authOptions);
  const userId = session ? await resolveUserId(session) : null;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();

  const business = await prisma.business.update({
    where: { userId },
    data: body,
  });

  return NextResponse.json({ business });
}
