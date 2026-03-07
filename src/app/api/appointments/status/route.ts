import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { appointmentId, status } = await req.json();

  if (!appointmentId || !status) {
    return NextResponse.json(
      { error: "appointmentId and status are required" },
      { status: 400 }
    );
  }

  const validStatuses = ["CHECKED_IN", "IN_PROGRESS", "READY_FOR_PICKUP", "PICKED_UP"];
  if (!validStatuses.includes(status)) {
    return NextResponse.json(
      { error: `Invalid status. Must be one of: ${validStatuses.join(", ")}` },
      { status: 400 }
    );
  }

  // Find appointment and verify ownership
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: {
      business: {
        include: { phoneNumber: true },
      },
    },
  });

  if (!appointment) {
    return NextResponse.json(
      { error: "Appointment not found" },
      { status: 404 }
    );
  }

  // Verify the user owns this business
  if (appointment.business.userId !== session.user.id) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 403 }
    );
  }

  const now = new Date();
  const petName = appointment.petName || "Your pet";
  const business = appointment.business;
  const fromNumber = business.phoneNumber?.number;

  // Build update data
  const updateData: Record<string, unknown> = {
    groomingStatus: status,
    groomingStatusAt: now,
  };

  if (status === "PICKED_UP") {
    updateData.completedAt = now;
    updateData.status = "COMPLETED";
  }

  if (status === "READY_FOR_PICKUP") {
    updateData.pickupNotifiedAt = now;
  }

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: updateData,
  });

  // Send SMS to customer
  if (appointment.customerPhone && fromNumber) {
    let smsBody: string;

    switch (status) {
      case "CHECKED_IN":
        smsBody = `${petName} is checked in at ${business.name}! We'll text you when they're ready.`;
        break;
      case "IN_PROGRESS":
        smsBody = `${petName} is in the chair! We'll text you when they're ready for pickup.`;
        break;
      case "READY_FOR_PICKUP":
        smsBody = `${petName} is all done and looking fabulous! Head to ${business.address || business.name} for pickup.`;
        break;
      case "PICKED_UP":
        smsBody = `Thanks for picking up ${petName}! Hope they feel great. See you next time!`;
        break;
      default:
        smsBody = `${petName}'s status has been updated.`;
    }

    await sendSms(appointment.customerPhone, smsBody, fromNumber);
  }

  return NextResponse.json({ ok: true, status });
}
