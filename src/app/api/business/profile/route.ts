import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { seedBreedRecommendations } from "@/lib/breed-recommendations";
import { getBookableFunnelSummary } from "@/lib/bookable-analytics";
import { getCalendarHealth } from "@/lib/calendar-health";

const stripeBypass = process.env.STRIPE_BYPASS === "true";

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
      groomers: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      phoneNumber: true,
      calendarConnections: { where: { isActive: true } },
    },
  });

  if (!business) {
    // Check if this user came through the demo gate — pre-fill what we know
    const email = session?.user?.email?.toLowerCase();
    const demoLead = email
      ? await prisma.demoLead.findUnique({
          where: { email },
          select: { businessName: true },
        })
      : null;
    return NextResponse.json({
      business: null,
      stats: null,
      demoLeadHint: demoLead?.businessName ? { businessName: demoLead.businessName } : null,
    });
  }

  // Compute dashboard stats
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [callsThisWeek, callsLastWeek, callsThisMonth, bookingsConfirmed, bookingsMissed, avgDuration, totalDuration, nextAppointment, bookingAttempts, callbacks] =
    await Promise.all([
      prisma.call.count({
        where: { businessId: business.id, isTestCall: false, createdAt: { gte: weekAgo } },
      }),
      prisma.call.count({
        where: { businessId: business.id, isTestCall: false, createdAt: { gte: twoWeeksAgo, lt: weekAgo } },
      }),
      prisma.call.count({
        where: { businessId: business.id, isTestCall: false, createdAt: { gte: monthAgo } },
      }),
      prisma.appointment.count({
        where: {
          businessId: business.id,
          status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
          createdAt: { gte: monthAgo },
        },
      }),
      prisma.call.count({
        where: {
          businessId: business.id,
          isTestCall: false,
          status: "NO_BOOKING",
          createdAt: { gte: monthAgo },
        },
      }),
      prisma.call.aggregate({
        where: { businessId: business.id, isTestCall: false, duration: { not: null } },
        _avg: { duration: true },
      }),
      prisma.call.aggregate({
        where: { businessId: business.id, isTestCall: false, duration: { not: null }, createdAt: { gte: monthAgo } },
        _sum: { duration: true },
      }),
      prisma.appointment.findFirst({
        where: {
          businessId: business.id,
          startTime: { gt: now },
          status: { in: ["PENDING", "CONFIRMED"] },
        },
        orderBy: { startTime: "asc" },
        select: { petName: true, serviceName: true, startTime: true, customerName: true },
      }),
      prisma.bookableSession.count({
        where: {
          businessId: business.id,
          createdAt: { gte: monthAgo },
          OR: [{ status: { not: "IN_PROGRESS" } }, { state: { not: "menu" } }],
        },
      }),
      prisma.bookableSession.count({
        where: {
          businessId: business.id,
          createdAt: { gte: monthAgo },
          status: { in: ["CALLBACK", "NO_SLOTS"] },
        },
      }),
    ]);

  // Estimate revenue protected
  const rawAvg =
    business.services.length > 0
      ? business.services.reduce((sum: number, s: { price: number }) => sum + Number(s.price), 0) / business.services.length
      : 0;
  const avgServicePrice = rawAvg > 0 ? rawAvg : 65;

  const totalCallMinutes = Math.round((totalDuration._sum.duration || 0) / 60);

  const stats = {
    callsThisWeek,
    callsLastWeek,
    callsThisMonth,
    bookingsConfirmed,
    bookingsMissed,
    bookingAttempts,
    callbacks,
    revenueProtected: Math.round(bookingsConfirmed * avgServicePrice),
    avgCallDuration: Math.round(avgDuration._avg.duration || 0),
    totalCallMinutes,
    nextAppointment,
  };

  // When STRIPE_BYPASS=true, tell the UI that the subscription is active
  if (stripeBypass && business) {
    (business as Record<string, unknown>).stripeSubscriptionStatus = "active";
  }

  // Include active demo session number so the onboarding UI can restore it on resume
  const demoSession = await prisma.demoSession.findUnique({
    where: { businessId: business.id },
    include: { demoNumber: true },
  });
  const demoPhoneNumber =
    demoSession && demoSession.expiresAt > new Date()
      ? demoSession.demoNumber.number
      : null;

  const [funnel, calendarHealth] = await Promise.all([
    getBookableFunnelSummary(business.id, monthAgo),
    getCalendarHealth(business.id),
  ]);

  return NextResponse.json({
    business,
    stats,
    demoPhoneNumber,
    funnel,
    calendarHealth,
  });
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
    inboundPath,
    vaccinePolicy,
    services,
  } = body;

  const existing = await prisma.business.findUnique({
    where: { userId },
    select: { id: true },
  });

  let business;
  if (existing) {
    business = await prisma.business.update({
      where: { userId },
      data: {
        ...(name !== undefined ? { name } : {}),
        ...(ownerName !== undefined ? { ownerName } : {}),
        ...(city !== undefined ? { city } : {}),
        ...(state !== undefined ? { state } : {}),
        ...(phone !== undefined ? { phone } : {}),
        ...(address !== undefined ? { address } : {}),
        ...(timezone !== undefined ? { timezone } : {}),
        ...(businessHours !== undefined ? { businessHours } : {}),
        ...(bookingMode !== undefined ? { bookingMode } : {}),
        ...(inboundPath === "BOOKABLE_VOICEMAIL"
          ? { inboundPath }
          : {}),
        ...(vaccinePolicy !== undefined && ["OFF", "FLAG_ONLY", "REQUIRE"].includes(vaccinePolicy) ? { vaccinePolicy } : {}),
        onboardingStep: 3,
      },
    });
  } else {
    if (!name || !ownerName) {
      return NextResponse.json(
        { error: "name and ownerName are required when creating a business profile" },
        { status: 400 }
      );
    }

    business = await prisma.business.create({
      data: {
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
    });
    // Seed default breed recommendations for new businesses
    await seedBreedRecommendations(business.id, prisma);
  }

  // Upsert services
  if (services && Array.isArray(services)) {
    // Deactivate existing services
    await prisma.service.updateMany({
      where: { businessId: business.id },
      data: { isActive: false },
    });

    // Create new services (with validation)
    for (const svc of services) {
      if (svc.name?.trim()) {
        const price = parseFloat(svc.price) || 0;
        const duration = parseInt(svc.duration) || 60;
        await prisma.service.create({
          data: {
            businessId: business.id,
            name: svc.name.trim().slice(0, 100),
            price: Math.max(0, Math.min(price, 9999)),
            duration: Math.max(5, Math.min(duration, 480)),
            isAddon: Boolean(svc.isAddon),
          },
        });
      }
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

  // Ignore legacy agent settings. Call Slot is Twilio keypad voicemail and
  // does not create, update, or require a conversational voice agent.
  delete body.agentActive;
  delete body.voiceId;
  delete body.personality;
  delete body.greeting;

  // Only allow safe fields to be updated
  const allowedFields = ["name", "ownerName", "city", "state", "phone", "address",
    "timezone", "businessHours", "bookingMode", "inboundPath", "vaccinePolicy", "isActive", "onboardingComplete",
    "onboardingStep", "googleReviewUrl", "plan"];
  const safeData: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in body) safeData[key] = body[key];
  }

  // Turning isActive on requires admin approval (unless bypassed for testing)
  if (safeData.isActive === true && !stripeBypass) {
    const biz = await prisma.business.findUnique({
      where: { userId },
      select: { adminApprovedGoLive: true },
    });
    if (!biz?.adminApprovedGoLive) {
      // Strip isActive from the update — don't reject outright so
      // onboardingComplete can still be set (e.g. goLive without approval)
      delete safeData.isActive;
    }
  }

  const business = await prisma.business.update({
    where: { userId },
    data: safeData,
  });

  return NextResponse.json({ business });
}
