import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { normalizePhoneNumber } from "@/lib/phone";
import { resolveBusinessFromDemo } from "@/lib/demo-session";
import { sendCancellationWithWaitlistNotification } from "@/lib/notifications";

// Retell custom tool endpoint: cancels an upcoming appointment for the caller.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-retell-signature") || "";

  if (!isRetellWebhookValid(rawBody, signature, req.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { args?: Record<string, string>; call?: Record<string, string> };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { args, call } = body;
  const { customer_name: customerName } = args || {};

  // Identify business from the called number
  const calledNumber = normalizePhoneNumber(call?.to_number);
  let phoneRecord = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: { include: { phoneNumber: true } } },
      })
    : null;

  if (!phoneRecord && calledNumber) {
    const demoBusinessId = await resolveBusinessFromDemo(calledNumber);
    if (demoBusinessId) {
      const demoBusiness = await prisma.business.findUnique({
        where: { id: demoBusinessId },
        include: { phoneNumber: true },
      });
      if (demoBusiness) {
        phoneRecord = { businessId: demoBusinessId, business: demoBusiness } as unknown as typeof phoneRecord;
      }
    }
  }

  if (!phoneRecord?.business) {
    return NextResponse.json({
      result: "I wasn't able to reach the booking system right now. Please call back to cancel.",
      cancelled: false,
    });
  }

  const business = phoneRecord.business;
  const callerPhone = normalizePhoneNumber(call?.from_number);
  const now = new Date();

  // Look up the next upcoming appointment for this caller
  type WhereClause = {
    businessId: string;
    status: { not: "CANCELLED" };
    startTime: { gte: Date };
    customerPhone?: string;
    customerName?: { contains: string; mode: "insensitive" };
  };

  let whereClause: WhereClause | null = null;
  if (callerPhone) {
    whereClause = {
      businessId: business.id,
      customerPhone: callerPhone,
      status: { not: "CANCELLED" },
      startTime: { gte: now },
    };
  } else if (customerName) {
    whereClause = {
      businessId: business.id,
      customerName: { contains: customerName, mode: "insensitive" },
      status: { not: "CANCELLED" },
      startTime: { gte: now },
    };
  }

  if (!whereClause) {
    return NextResponse.json({
      result: "I need a name to look up the appointment — what's the name on the booking?",
      cancelled: false,
    });
  }

  const appointment = await prisma.appointment.findFirst({
    where: whereClause,
    orderBy: { startTime: "asc" },
  });

  if (!appointment) {
    return NextResponse.json({
      result: "I couldn't find an upcoming appointment for you here. It may have already been cancelled.",
      cancelled: false,
    });
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "CANCELLED" },
  });

  // Notify the owner — non-blocking
  try {
    await sendCancellationWithWaitlistNotification(
      business as Parameters<typeof sendCancellationWithWaitlistNotification>[0],
      appointment
    );
  } catch (err) {
    console.error("[cancel-appointment] Owner notification failed (non-fatal):", err);
  }

  const timezone = business.timezone || "America/Los_Angeles";
  const timeStr = appointment.startTime.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });

  return NextResponse.json({
    result: `Done — ${appointment.petName ? `${appointment.petName}'s` : "the"} ${appointment.serviceName} on ${timeStr} has been cancelled. ${business.ownerName} has been notified.`,
    cancelled: true,
    appointment_id: appointment.id,
  });
}
