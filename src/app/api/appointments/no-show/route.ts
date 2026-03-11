import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canMarkAppointmentNoShow } from "@/lib/appointment-state";
import { parseJsonBody, requireCurrentBusiness } from "@/lib/route-helpers";

const noShowSchema = z.object({
  appointmentId: z.string().trim().min(1, "appointmentId is required"),
});

// Mark an appointment as no-show (from dashboard)
export async function POST(req: NextRequest) {
  const businessResult = await requireCurrentBusiness();
  if ("response" in businessResult) {
    return businessResult.response;
  }
  const { business } = businessResult;

  const bodyResult = await parseJsonBody(req, noShowSchema);
  if ("response" in bodyResult) {
    return bodyResult.response;
  }
  const { appointmentId } = bodyResult.data;

  const appointment = await prisma.appointment.findFirst({
    where: { id: appointmentId, businessId: business.id },
  });

  if (!appointment) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  if (!canMarkAppointmentNoShow(appointment.status)) {
    return NextResponse.json(
      { error: "Only active appointments can be marked as no-show" },
      { status: 400 }
    );
  }

  await prisma.appointment.update({
    where: { id: appointmentId },
    data: {
      status: "NO_SHOW",
      noShowMarkedAt: new Date(),
    },
  });

  return NextResponse.json({ success: true });
}
