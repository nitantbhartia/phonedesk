import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: list all campaigns for this business
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

  const campaigns = await prisma.campaign.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ campaigns });
}

// POST: create a new campaign
export async function POST(req: NextRequest) {
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

  const body = await req.json();
  const { name, type, messageTemplate, targetSegment } = body;

  if (!name || !type || !messageTemplate) {
    return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      businessId: business.id,
      name,
      type,
      messageTemplate,
      targetSegment: targetSegment ?? undefined,
    },
  });

  return NextResponse.json({ campaign });
}
