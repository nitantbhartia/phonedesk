import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  send48hReminder,
  sendNoResponseFollowUp,
} from "@/lib/notifications";
import { verifyCronAuth } from "@/lib/cron-auth";

// Cron endpoint for 48-hour reminders (called every 30 minutes)
// Also handles follow-up for unconfirmed appointments at ~12h mark
export async function POST(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const now = new Date();

  // --- 48h reminders ---
  const in48Hours = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const in47Hours = new Date(now.getTime() + 47 * 60 * 60 * 1000);

  const appointments48h = await prisma.appointment.findMany({
    where: {
      startTime: { gte: in47Hours, lte: in48Hours },
      reminder48hSent: false,
      status: { in: ["CONFIRMED", "PENDING"] },
      customerPhone: { not: null },
    },
    include: {
      business: { include: { phoneNumber: true } },
    },
  });

  let sent48h = 0;
  let errors48h = 0;

  for (const appointment of appointments48h) {
    try {
      if (appointment.business.phoneNumber) {
        await send48hReminder(
          appointment.business as Parameters<typeof send48hReminder>[0],
          appointment
        );
        sent48h++;
      }
    } catch (error) {
      console.error(`Error sending 48h reminder for ${appointment.id}:`, error);
      errors48h++;
    }
  }

  // --- No-response follow-up (12h before appointment) ---
  // If 48h reminder was sent but appointment is still PENDING (not confirmed),
  // send a follow-up at ~12 hours before
  const in12Hours = new Date(now.getTime() + 12 * 60 * 60 * 1000);
  const in11Hours = new Date(now.getTime() + 11 * 60 * 60 * 1000);

  const unconfirmedAppointments = await prisma.appointment.findMany({
    where: {
      startTime: { gte: in11Hours, lte: in12Hours },
      reminder48hSent: true,
      reminderSent: false, // use this as a proxy for "follow-up not yet sent"
      status: "PENDING",
      customerPhone: { not: null },
      confirmedAt: null,
    },
    include: {
      business: { include: { phoneNumber: true } },
    },
  });

  let sentFollowUp = 0;

  for (const appointment of unconfirmedAppointments) {
    try {
      if (appointment.business.phoneNumber) {
        await sendNoResponseFollowUp(
          appointment.business as Parameters<typeof sendNoResponseFollowUp>[0],
          appointment
        );
        sentFollowUp++;
      }
    } catch (error) {
      console.error(`Error sending follow-up for ${appointment.id}:`, error);
    }
  }

  return NextResponse.json({
    reminders48h: { processed: appointments48h.length, sent: sent48h, errors: errors48h },
    followUps: { processed: unconfirmedAppointments.length, sent: sentFollowUp },
  });
}
