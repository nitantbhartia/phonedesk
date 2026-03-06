import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: Get rebooking config
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

  let config = await prisma.rebookingConfig.findUnique({
    where: { businessId: business.id },
  });

  if (!config) {
    // Return defaults
    config = await prisma.rebookingConfig.create({
      data: {
        businessId: business.id,
        enabled: true,
        defaultInterval: 42,
        reminderDaysBefore: 7,
      },
    });
  }

  return NextResponse.json({ config });
}

// POST: Update rebooking config
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
  const { enabled, defaultInterval, reminderDaysBefore } = body;

  const config = await prisma.rebookingConfig.upsert({
    where: { businessId: business.id },
    create: {
      businessId: business.id,
      enabled: enabled ?? true,
      defaultInterval: defaultInterval ?? 42,
      reminderDaysBefore: reminderDaysBefore ?? 7,
    },
    update: {
      ...(enabled !== undefined && { enabled }),
      ...(defaultInterval !== undefined && { defaultInterval }),
      ...(reminderDaysBefore !== undefined && { reminderDaysBefore }),
    },
  });

  return NextResponse.json({ config });
}
