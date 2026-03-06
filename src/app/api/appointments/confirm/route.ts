import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// One-tap confirm endpoint (linked from SMS)
export async function GET(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  const token = req.nextUrl.searchParams.get("token");

  if (!id) {
    return NextResponse.json({ error: "Missing appointment ID" }, { status: 400 });
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
    return NextResponse.json({ message: "Already confirmed", appointment });
  }

  const updated = await prisma.appointment.update({
    where: { id },
    data: {
      status: "CONFIRMED",
      confirmedAt: new Date(),
    },
  });

  // Notify owner
  if (appointment.business.phone && appointment.business.phoneNumber) {
    const { sendSms } = await import("@/lib/retell");
    const { formatDateTime } = await import("@/lib/utils");
    await sendSms(
      appointment.business.phone,
      `[RingPaw] ${appointment.customerName} confirmed their ${appointment.serviceName || "grooming"} appointment (${formatDateTime(appointment.startTime)}).`,
      appointment.business.phoneNumber.number
    );
  }

  // Redirect to a simple confirmation page or return JSON
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  return NextResponse.redirect(`${appUrl}/appointment-confirmed?name=${encodeURIComponent(appointment.customerName)}&business=${encodeURIComponent(appointment.business.name)}`);
}

// Also support POST for API usage
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { appointmentId } = body;

  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
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
