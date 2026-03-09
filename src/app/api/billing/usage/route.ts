import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Minutes included per plan
const PLAN_MINUTES: Record<string, number> = {
  STARTER: 120,
  PRO: 300,
  BUSINESS: 500,
};

const PLAN_NAMES: Record<string, string> = {
  STARTER: "Solo",
  PRO: "Studio",
  BUSINESS: "Salon",
};

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: { business: true },
  });

  if (!user?.business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const business = user.business;

  // Sum call durations (seconds) for the current calendar month
  const now = new Date();
  const periodStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const result = await prisma.call.aggregate({
    where: {
      businessId: business.id,
      createdAt: { gte: periodStart },
      duration: { not: null },
    },
    _sum: { duration: true },
  });

  const secondsUsed = result._sum.duration ?? 0;
  const minutesUsed = Math.round(secondsUsed / 60);
  const minutesLimit = PLAN_MINUTES[business.plan] ?? 120;
  const minutesRemaining = Math.max(0, minutesLimit - minutesUsed);
  const overageMinutes = Math.max(0, minutesUsed - minutesLimit);
  const percentUsed = minutesLimit > 0 ? Math.min((minutesUsed / minutesLimit) * 100, 999) : 0;

  return NextResponse.json({
    minutesUsed,
    minutesLimit,
    minutesRemaining,
    overageMinutes,
    percentUsed: Math.round(percentUsed),
    plan: business.plan,
    planName: PLAN_NAMES[business.plan] ?? "Solo",
    subscriptionStatus: business.stripeSubscriptionStatus,
    periodStart: periodStart.toISOString(),
  });
}
