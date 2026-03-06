import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST: Log a behavior note
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
  const { petName, customerId, petId, appointmentId, severity, note, tags } =
    body;

  if (!petName || !note) {
    return NextResponse.json(
      { error: "petName and note are required" },
      { status: 400 }
    );
  }

  const validSeverities = ["NOTE", "CAUTION", "HIGH_RISK"];
  const normalizedSeverity = validSeverities.includes(severity)
    ? severity
    : "NOTE";

  const behaviorLog = await prisma.behaviorLog.create({
    data: {
      businessId: business.id,
      petName,
      customerId: customerId || null,
      petId: petId || null,
      appointmentId: appointmentId || null,
      severity: normalizedSeverity,
      note,
      tags: Array.isArray(tags) ? tags : [],
    },
  });

  return NextResponse.json({ behaviorLog });
}

// GET: Get behavior logs, optional filters: ?petId=X or ?customerId=X
export async function GET(req: NextRequest) {
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

  const { searchParams } = new URL(req.url);
  const petId = searchParams.get("petId");
  const customerId = searchParams.get("customerId");

  const where: Record<string, unknown> = { businessId: business.id };
  if (petId) where.petId = petId;
  if (customerId) where.customerId = customerId;

  const behaviorLogs = await prisma.behaviorLog.findMany({
    where,
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({ behaviorLogs });
}
