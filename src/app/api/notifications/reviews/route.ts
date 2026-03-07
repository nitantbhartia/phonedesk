import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { verifyCronAuth } from "@/lib/cron-auth";

const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

// Cron endpoint: Send Google review requests ~2 hours after completion/pickup
export async function POST(req: NextRequest) {
  const authError = verifyCronAuth(req);
  if (authError) return authError;

  const now = new Date();
  // Window: 1.5 to 2.5 hours ago
  const windowStart = new Date(now.getTime() - 2.5 * 60 * 60 * 1000);
  const windowEnd = new Date(now.getTime() - 1.5 * 60 * 60 * 1000);
  const ninetyDaysAgo = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);

  let sent = 0;
  const errors: string[] = [];

  // Find appointments that completed or were picked up ~2 hours ago
  const appointments = await prisma.appointment.findMany({
    where: {
      reviewRequested: false,
      customerPhone: { not: null },
      OR: [
        {
          status: "COMPLETED",
          completedAt: { gte: windowStart, lte: windowEnd },
        },
        {
          groomingStatus: "PICKED_UP",
          pickupNotifiedAt: { gte: windowStart, lte: windowEnd },
        },
      ],
    },
    include: {
      business: {
        include: { phoneNumber: true },
      },
    },
  });

  for (const appt of appointments) {
    const business = appt.business;

    // Business must have a Google review URL
    if (!business.googleReviewUrl) continue;

    const fromNumber = business.phoneNumber?.number;
    if (!fromNumber) continue;
    if (!appt.customerPhone) continue;

    // Check that customer hasn't been asked in last 90 days
    const recentRequest = await prisma.reviewRequest.findFirst({
      where: {
        businessId: business.id,
        customerPhone: appt.customerPhone,
        sentAt: { gte: ninetyDaysAgo },
      },
    });

    if (recentRequest) continue;

    // Create ReviewRequest record
    const reviewRequest = await prisma.reviewRequest.create({
      data: {
        businessId: business.id,
        customerPhone: appt.customerPhone,
        customerName: appt.customerName,
        petName: appt.petName,
        appointmentId: appt.id,
      },
    });

    // Build tracking URL that redirects to Google review
    const trackingUrl = `${appUrl}/api/reviews/click?id=${reviewRequest.id}`;

    const petName = appt.petName || "your pet";
    const message = `So glad ${petName} got pampered today at ${business.name}! If you have 30 seconds, a Google review would mean the world to us: ${trackingUrl}`;

    try {
      await sendSms(appt.customerPhone, message, fromNumber);
      await prisma.appointment.update({
        where: { id: appt.id },
        data: { reviewRequested: true },
      });
      sent++;
    } catch (error) {
      console.error(
        `Failed to send review request for appointment ${appt.id}:`,
        error
      );
      errors.push(appt.id);
    }
  }

  return NextResponse.json({
    ok: true,
    sent,
    errors: errors.length,
  });
}
