import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendCancellationWithWaitlistNotification, sendWaitlistOpeningNotification } from "@/lib/notifications";
import { formatDateTime } from "@/lib/utils";
import { verifyAppointmentToken } from "@/lib/appointment-token";

// Cancel an appointment and auto-fill from waitlist
// Requires either: (1) authenticated dashboard session, or (2) signed token
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { appointmentId, token } = body;

  if (!appointmentId) {
    return NextResponse.json({ error: "Missing appointmentId" }, { status: 400 });
  }

  // Allow either: (1) signed token, or (2) authenticated dashboard session
  if (token) {
    if (!verifyAppointmentToken(appointmentId, "cancel", token)) {
      return NextResponse.json({ error: "Invalid token" }, { status: 403 });
    }
  } else {
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
    const ownsAppointment = await prisma.appointment.findFirst({
      where: { id: appointmentId, businessId: business.id },
    });
    if (!ownsAppointment) {
      return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
    }
  }

  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { business: { include: { phoneNumber: true } } },
  });

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  // Cancel the appointment
  await prisma.appointment.update({
    where: { id: appointmentId },
    data: { status: "CANCELLED" },
  });

  // Try to fill from waitlist
  const waitlistMatch = await tryFillFromWaitlist(appointment);

  // Notify owner
  const business = appointment.business as Parameters<typeof sendCancellationWithWaitlistNotification>[0];
  await sendCancellationWithWaitlistNotification(
    business,
    appointment,
    waitlistMatch?.customerName
  );

  return NextResponse.json({
    cancelled: true,
    waitlistNotified: waitlistMatch?.customerName || null,
  });
}

async function tryFillFromWaitlist(appointment: {
  id: string;
  businessId: string;
  startTime: Date;
  serviceName: string | null;
  business: { name: string; phone: string | null; phoneNumber: { number: string } | null };
}) {
  // Find matching waitlist entries for the same date
  const startOfDay = new Date(appointment.startTime);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(appointment.startTime);
  endOfDay.setHours(23, 59, 59, 999);

  const entries = await prisma.waitlistEntry.findMany({
    where: {
      businessId: appointment.businessId,
      status: "WAITING",
      preferredDate: { gte: startOfDay, lte: endOfDay },
    },
    orderBy: { createdAt: "asc" }, // first come, first served
  });

  if (entries.length === 0) return null;

  const entry = entries[0];

  // Mark as notified
  await prisma.waitlistEntry.update({
    where: { id: entry.id },
    data: {
      status: "NOTIFIED",
      notifiedAt: new Date(),
    },
  });

  // Send notification
  if (appointment.business.phoneNumber) {
    await sendWaitlistOpeningNotification(
      appointment.business as Parameters<typeof sendWaitlistOpeningNotification>[0],
      entry,
      formatDateTime(appointment.startTime)
    );
  }

  return entry;
}
