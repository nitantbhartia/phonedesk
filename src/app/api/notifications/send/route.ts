import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendAppointmentReminder } from "@/lib/notifications";
import { verifyCronAuth } from "@/lib/cron-auth";

// Cron endpoint for sending appointment reminders (called every 30 minutes)
export async function POST(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const now = new Date();
  const in24Hours = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const in23Hours = new Date(now.getTime() + 23 * 60 * 60 * 1000);

  // Find appointments in the next 23-24 hours that haven't been reminded
  const appointments = await prisma.appointment.findMany({
    where: {
      startTime: { gte: in23Hours, lte: in24Hours },
      reminderSent: false,
      status: { in: ["CONFIRMED", "PENDING"] },
      customerPhone: { not: null },
    },
    include: {
      business: { include: { phoneNumber: true } },
    },
  });

  let sent = 0;
  let errors = 0;

  for (const appointment of appointments) {
    try {
      if (appointment.business.phoneNumber) {
        await sendAppointmentReminder(
          appointment.business as Parameters<typeof sendAppointmentReminder>[0],
          appointment
        );
        sent++;
      }
    } catch (error) {
      console.error(`Error sending reminder for ${appointment.id}:`, error);
      errors++;
    }
  }

  return NextResponse.json({
    processed: appointments.length,
    sent,
    errors,
  });
}
