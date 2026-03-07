import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { verifyAppointmentToken } from "@/lib/appointment-token";

// One-tap confirm endpoint (linked from SMS) — requires signed token
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const token = req.nextUrl.searchParams.get("token");

  if (!id || !token) {
    return NextResponse.json({ error: "Missing appointment ID or token" }, { status: 400 });
  }

  if (!verifyAppointmentToken(id, "confirm", token)) {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 403 });
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id },
    include: { business: { include: { phoneNumber: true } } },
  });

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  if (appointment.status === "CANCELLED") {
    return NextResponse.json({ error: "This appointment was already cancelled" }, { status: 400 });
  }

  if (appointment.status === "CONFIRMED") {
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    return NextResponse.redirect(
      `${appUrl}/appointment-confirmed?name=${encodeURIComponent(appointment.customerName)}&business=${encodeURIComponent(appointment.business.name)}`
    );
  }

  await prisma.appointment.update({
    where: { id },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
  });

  // Notify owner
  if (appointment.business.phone && appointment.business.phoneNumber) {
    const { sendSms } = await import("@/lib/sms");
    const { formatDateTime } = await import("@/lib/utils");
    await sendSms(
      appointment.business.phone,
      `[RingPaw] ${appointment.customerName} confirmed their ${appointment.serviceName || "grooming"} appointment (${formatDateTime(appointment.startTime)}).`,
      process.env.TWILIO_PHONE_NUMBER || appointment.business.phoneNumber.number
    );
  }

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(
    `${appUrl}/appointment-confirmed?name=${encodeURIComponent(appointment.customerName)}&business=${encodeURIComponent(appointment.business.name)}`
  );
}

// POST: Confirm from dashboard (requires auth) or with signed token
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { appointmentId, token } = body;

  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  // Allow either: (1) signed token, or (2) authenticated dashboard session
  if (token) {
    if (!verifyAppointmentToken(appointmentId, "confirm", token)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }
  } else {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // Verify the appointment belongs to the user's business
    const business = await prisma.business.findUnique({
      where: { userId: session.user.id },
    });
    if (!business) {
      return NextResponse.json({ error: "No business" }, { status: 404 });
    }
    const appointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, businessId: business.id },
    });
    if (!appointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }
  }

  const updated = await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
  });

  return NextResponse.json({ appointment: updated });
}
