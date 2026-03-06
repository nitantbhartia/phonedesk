import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";

// Cron endpoint: Send rebooking reminders
export async function POST(req: NextRequest) {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();
  let sent = 0;
  const errors: string[] = [];

  // Get all businesses with rebooking enabled
  const configs = await prisma.rebookingConfig.findMany({
    where: { enabled: true },
    include: {
      business: {
        include: { phoneNumber: true },
      },
    },
  });

  for (const config of configs) {
    const business = config.business;
    const fromNumber = business.phoneNumber?.number;

    if (!fromNumber) continue;

    // Find completed appointments where it's time to send a rebooking reminder
    // completedAt + rebookInterval - reminderDaysBefore <= now
    // i.e., completedAt <= now - (rebookInterval - reminderDaysBefore) days
    const reminderThresholdDays = config.defaultInterval - config.reminderDaysBefore;
    const thresholdDate = new Date(
      now.getTime() - reminderThresholdDays * 24 * 60 * 60 * 1000
    );

    const appointments = await prisma.appointment.findMany({
      where: {
        businessId: business.id,
        status: "COMPLETED",
        completedAt: { not: null, lte: thresholdDate },
        rebookSent: false,
      },
    });

    for (const appt of appointments) {
      // Use appointment-specific interval or the default
      const interval = appt.rebookInterval || config.defaultInterval;
      const apptReminderDays = interval - config.reminderDaysBefore;
      const apptThreshold = new Date(
        now.getTime() - apptReminderDays * 24 * 60 * 60 * 1000
      );

      // Check if this specific appointment is actually due
      if (appt.completedAt! > apptThreshold) continue;

      if (!appt.customerPhone) continue;

      const petName = appt.petName || "your pet";
      const message = `Hi ${appt.customerName}! ${petName} is due for their next groom. Want to grab a spot before the weekend fills up? Call ${business.phone || fromNumber} or reply REBOOK to book now.`;

      try {
        await sendSms(appt.customerPhone, message, fromNumber);
        await prisma.appointment.update({
          where: { id: appt.id },
          data: { rebookSent: true },
        });
        sent++;
      } catch (error) {
        console.error(
          `Failed to send rebooking SMS for appointment ${appt.id}:`,
          error
        );
        errors.push(appt.id);
      }
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    errors: errors.length,
  });
}
