import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { canApplyGroomingStatus } from "@/lib/appointment-state";
import { parseJsonBody, requireCurrentUserId } from "@/lib/route-helpers";

const appointmentStatusSchema = z.object({
  appointmentId: z.string().trim().min(1, "appointmentId is required"),
  status: z.enum(["CHECKED_IN", "IN_PROGRESS", "READY_FOR_PICKUP", "PICKED_UP"]),
});

export async function POST(req: NextRequest) {
  const userResult = await requireCurrentUserId();
  if ("response" in userResult) {
    return userResult.response;
  }

  const bodyResult = await parseJsonBody(req, appointmentStatusSchema);
  if ("response" in bodyResult) {
    return bodyResult.response;
  }
  const { appointmentId, status } = bodyResult.data;

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
  if (appointment.business.userId !== userResult.userId) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 403 }
    );
  }

  if (
    !canApplyGroomingStatus({
      appointmentStatus: appointment.status,
      currentGroomingStatus: appointment.groomingStatus,
      nextGroomingStatus: status,
    })
  ) {
    return NextResponse.json(
      {
        error:
          "This status update is not allowed for the appointment's current state",
      },
      { status: 400 }
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

  // Send SMS to customer — fire-and-forget so an SMS failure doesn't
  // roll back the already-committed status update.
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

    try {
      await sendSms(appointment.customerPhone, smsBody, fromNumber);
    } catch (e) {
      console.error("[appointments/status] SMS failed for appointment", appointmentId, e);
    }
  }

  return NextResponse.json({ ok: true, status });
}
