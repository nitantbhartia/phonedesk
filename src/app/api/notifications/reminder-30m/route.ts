import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendOnMyWayReminder } from "@/lib/notifications";
import { verifyCronAuth } from "@/lib/cron-auth";

// Cron endpoint for 30-minute "on my way" reminders (called every 30 minutes)
export async function POST(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const now = new Date();
  const in28Minutes = new Date(now.getTime() + 28 * 60 * 1000);
  const in32Minutes = new Date(now.getTime() + 32 * 60 * 1000);

  const appointments = await prisma.appointment.findMany({
    where: {
      startTime: { gte: in28Minutes, lte: in32Minutes },
      onMyWaySent: false,
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
        await sendOnMyWayReminder(
          appointment.business as Parameters<typeof sendOnMyWayReminder>[0],
          appointment
        );
        sent++;
      }
    } catch (error) {
      console.error(`Error sending 30m reminder for ${appointment.id}:`, error);
      errors++;
    }
  }

  return NextResponse.json({
    reminders30m: { processed: appointments.length, sent, errors },
  });
}
