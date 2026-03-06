import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: Pre-appointment brief
// Input: ?appointmentId=X
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
  const appointmentId = searchParams.get("appointmentId");

  if (!appointmentId) {
    return NextResponse.json(
      { error: "appointmentId is required" },
      { status: 400 }
    );
  }

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, businessId: business.id },
  });

  if (!appointment) {
    return NextResponse.json(
      { error: "Appointment not found" },
      { status: 404 }
    );
  }

  // Look up customer and pet behavior history
  const behaviorWhere: Record<string, unknown> = {
    businessId: business.id,
  };

  // Try to find by customer phone -> customer -> petId, or fall back to petName
  let petRecord = null;
  let customerRecord = null;

  if (appointment.customerPhone) {
    customerRecord = await prisma.customer.findFirst({
      where: {
        businessId: business.id,
        phone: appointment.customerPhone,
      },
      include: { pets: true },
    });

    if (customerRecord && appointment.petName) {
      petRecord =
        customerRecord.pets.find(
          (p) =>
            p.name.toLowerCase() === appointment.petName?.toLowerCase()
        ) || null;
    }
  }

  // Build the query: match by petId, customerId, or petName
  const orConditions: Record<string, unknown>[] = [];
  if (petRecord) orConditions.push({ petId: petRecord.id });
  if (customerRecord) orConditions.push({ customerId: customerRecord.id });
  if (appointment.petName) {
    orConditions.push({
      petName: { equals: appointment.petName, mode: "insensitive" },
    });
  }

  let recentLogs: Awaited<ReturnType<typeof prisma.behaviorLog.findMany>> = [];
  let highRisk = false;

  if (orConditions.length > 0) {
    recentLogs = await prisma.behaviorLog.findMany({
      where: {
        businessId: business.id,
        OR: orConditions,
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });

    highRisk = recentLogs.some((log) => log.severity === "HIGH_RISK");
  }

  // Build behavior summary
  const severityCounts = { NOTE: 0, CAUTION: 0, HIGH_RISK: 0 };
  const allTags = new Set<string>();
  for (const log of recentLogs) {
    severityCounts[log.severity]++;
    for (const tag of log.tags) {
      allTags.add(tag);
    }
  }

  const summaryParts: string[] = [];
  if (recentLogs.length === 0) {
    summaryParts.push("No behavior notes on file.");
  } else {
    summaryParts.push(`${recentLogs.length} behavior note(s) on file.`);
    if (severityCounts.HIGH_RISK > 0) {
      summaryParts.push(
        `${severityCounts.HIGH_RISK} HIGH RISK flag(s).`
      );
    }
    if (severityCounts.CAUTION > 0) {
      summaryParts.push(`${severityCounts.CAUTION} CAUTION flag(s).`);
    }
    if (allTags.size > 0) {
      summaryParts.push(`Tags: ${Array.from(allTags).join(", ")}.`);
    }
  }

  return NextResponse.json({
    petName: appointment.petName,
    breed: appointment.petBreed || petRecord?.breed || null,
    size: appointment.petSize || petRecord?.size || null,
    behaviorSummary: summaryParts.join(" "),
    recentLogs: recentLogs.map((log) => ({
      id: log.id,
      severity: log.severity,
      note: log.note,
      tags: log.tags,
      createdAt: log.createdAt,
    })),
    highRisk,
  });
}
