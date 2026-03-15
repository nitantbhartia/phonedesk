import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: preview recipients for a campaign without sending
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
    include: { rebookingConfig: true },
  });
  if (!business) {
    return NextResponse.json({ error: "No business" }, { status: 404 });
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id, businessId: business.id },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const now = new Date();
  const defaultInterval = business.rebookingConfig?.defaultInterval ?? 42;
  const segment = campaign.targetSegment as Record<string, unknown> | null;

  let count = 0;

  if (campaign.type === "WIN_BACK") {
    const lapseThreshold = new Date(
      now.getTime() - defaultInterval * 24 * 60 * 60 * 1000
    );
    const candidates = await prisma.customer.findMany({
      where: {
        businessId: business.id,
        smsOptOut: false,
        lastVisitAt: { lte: lapseThreshold },
      },
      select: { phone: true },
    });
    const phones = candidates.map((c) => c.phone);
    const futureAppts = await prisma.appointment.findMany({
      where: {
        businessId: business.id,
        status: { in: ["PENDING", "CONFIRMED"] },
        startTime: { gte: now },
        customerPhone: { in: phones },
      },
      select: { customerPhone: true },
    });
    const hasUpcoming = new Set(futureAppts.map((a) => a.customerPhone));
    count = candidates.filter((c) => !hasUpcoming.has(c.phone)).length;
  } else if (campaign.type === "CAPACITY_FILL") {
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    count = await prisma.customer.count({
      where: {
        businessId: business.id,
        smsOptOut: false,
        OR: [{ lastContactAt: { lte: twoWeeksAgo } }, { lastContactAt: null }],
      },
    });
    count = Math.min(count, 100);
  } else {
    const minVisits = typeof segment?.minVisitCount === "number" ? segment.minVisitCount : 1;
    count = await prisma.customer.count({
      where: {
        businessId: business.id,
        smsOptOut: false,
        visitCount: { gte: minVisits },
      },
    });
  }

  return NextResponse.json({ recipientCount: count });
}
