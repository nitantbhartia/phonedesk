import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseOwnerCommand, executeCommand } from "@/lib/sms-commands";
import { normalizePhoneNumber } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";

// Retell inbound SMS webhook (set via inbound_sms_webhook_url on the phone number)
// Retell sends: { agent_id, from_number, to_number, message }
// For standard inbound texts the message field is present at root level.
// We handle known keywords (CANCEL, CONFIRM, STATUS, REBOOK, BOOK) directly
// and pass everything else through to Retell's chat agent.

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Retell inbound SMS webhook sends fields at root level or nested
  const from = (body.from_number || body.chat_inbound?.from_number) as string;
  const to = (body.to_number || body.chat_inbound?.to_number) as string;
  const messageBody = (body.message || body.text || body.chat_inbound?.message || "") as string;

  if (!from || !to) {
    return NextResponse.json({ ok: true });
  }

  // Rate limit: 20 messages per minute per sender
  const { allowed } = rateLimit(`sms:${from}`, { limit: 20, windowMs: 60_000 });
  if (!allowed) {
    return NextResponse.json({ ok: true });
  }

  // Log inbound SMS
  await prisma.smsLog.create({
    data: {
      direction: "INBOUND",
      fromNumber: from,
      toNumber: to,
      body: messageBody,
    },
  });

  // Find the business by RingPaw number
  const phoneRecord = await prisma.phoneNumber.findFirst({
    where: { number: to },
    include: { business: true },
  });

  if (!phoneRecord?.business) {
    return NextResponse.json({ ok: true });
  }

  const business = phoneRecord.business;
  const normalizedFrom = normalizePhoneNumber(from);
  const normalizedBusinessPhone = normalizePhoneNumber(business.phone);

  // Check if this is the owner texting (from their business phone)
  if (normalizedFrom && normalizedBusinessPhone && normalizedFrom === normalizedBusinessPhone) {
    // Owner SMS command
    try {
      const command = await parseOwnerCommand(messageBody);

      // Log parsed intent
      await prisma.smsLog.updateMany({
        where: {
          fromNumber: from,
          toNumber: to,
          body: messageBody,
        },
        data: { intent: command.intent, businessId: business.id },
      });

      await executeCommand(business.id, command, from, to);
    } catch (error) {
      console.error("Error processing owner command:", error);
      const { sendSms } = await import("@/lib/retell");
      await sendSms(
        from,
        "[RingPaw] Sorry, I had trouble processing that. Try again or text 'help' for available commands.",
        to
      );
    }
  } else {
    // Customer SMS - check for CANCEL/CONFIRM keyword
    const upperBody = messageBody.trim().toUpperCase();

    if (upperBody === "CANCEL") {
      const appointment = await prisma.appointment.findFirst({
        where: {
          businessId: business.id,
          customerPhone: { in: [from, normalizedFrom || from] },
          status: { in: ["CONFIRMED", "PENDING"] },
          startTime: { gte: new Date() },
        },
        orderBy: { startTime: "asc" },
      });

      if (appointment) {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { status: "CANCELLED" },
        });

        const { sendSms } = await import("@/lib/retell");
        await sendSms(
          from,
          `Your appointment at ${business.name} has been cancelled. Call us to reschedule!`,
          to
        );

        // Notify owner
        if (normalizedBusinessPhone) {
          await sendSms(
            normalizedBusinessPhone,
            `[RingPaw] ${appointment.customerName} cancelled their ${appointment.serviceName || "grooming"} appointment.`,
            to
          );
        }
      } else {
        const { sendSms } = await import("@/lib/retell");
        await sendSms(
          from,
          `No upcoming appointment found. Call ${business.name} to make changes.`,
          to
        );
      }
    } else if (upperBody === "CONFIRM") {
      const appointment = await prisma.appointment.findFirst({
        where: {
          businessId: business.id,
          customerPhone: { in: [from, normalizedFrom || from] },
          status: { in: ["PENDING", "CONFIRMED"] },
          startTime: { gte: new Date() },
        },
        orderBy: { startTime: "asc" },
      });

      if (appointment) {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: {
            status: "CONFIRMED",
            confirmedAt: new Date(),
          },
        });

        const { sendSms } = await import("@/lib/retell");
        await sendSms(
          from,
          `Your appointment at ${business.name} is confirmed! See you soon. 🐾`,
          to
        );

        // Notify owner
        if (business.phone) {
          const { formatDateTime } = await import("@/lib/utils");
          await sendSms(
            business.phone,
            `[RingPaw] ${appointment.customerName} confirmed their ${appointment.serviceName || "grooming"} appointment (${formatDateTime(appointment.startTime)}).`,
            to
          );
        }
      }
    } else if (upperBody === "BOOK") {
      // Waitlist: customer wants the offered slot
      const waitlistEntry = await prisma.waitlistEntry.findFirst({
        where: {
          businessId: business.id,
          customerPhone: from,
          status: "NOTIFIED",
        },
        orderBy: { notifiedAt: "desc" },
      });

      if (waitlistEntry) {
        await prisma.waitlistEntry.update({
          where: { id: waitlistEntry.id },
          data: { status: "BOOKED", bookedAt: new Date() },
        });

        const { sendSms } = await import("@/lib/retell");
        await sendSms(
          from,
          `Great — you're booked! We'll see ${waitlistEntry.petName || "your pet"} at ${business.name} soon. Reply CANCEL if plans change.`,
          to
        );

        // Notify owner
        if (business.phone) {
          await sendSms(
            business.phone,
            `[RingPaw] Waitlist fill! ${waitlistEntry.customerName} booked the opening for ${waitlistEntry.petName || "their pet"}.`,
            to
          );
        }
      }
    } else if (upperBody === "REBOOK") {
      // Customer wants to rebook after receiving a rebooking reminder
      const lastCompleted = await prisma.appointment.findFirst({
        where: {
          businessId: business.id,
          customerPhone: { in: [from, normalizedFrom || from] },
          status: "COMPLETED",
        },
        orderBy: { completedAt: "desc" },
      });

      const { sendSms } = await import("@/lib/retell");

      if (lastCompleted) {
        const petName = lastCompleted.petName || "your pet";
        await sendSms(
          from,
          `Great! Call us at ${business.phone || to} and we'll get ${petName} scheduled. Or text us your preferred date/time and we'll check availability!`,
          to
        );
      } else {
        await sendSms(
          from,
          `We'd love to book you in! Call us at ${business.phone || to} to schedule an appointment.`,
          to
        );
      }
    } else if (upperBody === "STATUS") {
      // Customer checking on their pet's grooming status
      const todayStart = new Date();
      todayStart.setHours(0, 0, 0, 0);
      const todayEnd = new Date();
      todayEnd.setHours(23, 59, 59, 999);

      const appointment = await prisma.appointment.findFirst({
        where: {
          businessId: business.id,
          customerPhone: { in: [from, normalizedFrom || from] },
          startTime: { gte: todayStart, lte: todayEnd },
          status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
        },
        orderBy: { startTime: "asc" },
      });

      const { sendSms } = await import("@/lib/retell");
      const { formatDateTime } = await import("@/lib/utils");

      if (appointment) {
        const petName = appointment.petName || "Your pet";
        let statusMessage: string;

        switch (appointment.groomingStatus) {
          case "CHECKED_IN":
            statusMessage = `${petName} is checked in and waiting.`;
            break;
          case "IN_PROGRESS":
            statusMessage = `${petName} is currently being groomed! Almost done.`;
            break;
          case "READY_FOR_PICKUP":
            statusMessage = `${petName} is ready for pickup! Head to ${business.address || business.name}.`;
            break;
          case "PICKED_UP":
            statusMessage = `All done! Hope ${petName} feels great.`;
            break;
          default:
            statusMessage = `Your appointment is scheduled for ${formatDateTime(appointment.startTime)}. We'll update you when ${petName} is checked in!`;
            break;
        }

        await sendSms(from, statusMessage, to);
      } else {
        await sendSms(
          from,
          `No appointment found for today. Call ${business.name} for details.`,
          to
        );
      }
    } else if (messageBody.trim()) {
      // Unrecognized message — send a helpful reply with available commands
      const { sendSms } = await import("@/lib/retell");
      await sendSms(
        from,
        `Thanks for texting ${business.name}! Here's what I can help with:\n\n` +
        `STATUS - Check on your pet\n` +
        `CONFIRM - Confirm an appointment\n` +
        `CANCEL - Cancel an appointment\n` +
        `REBOOK - Schedule your next visit\n\n` +
        `Or call us at ${business.phone || to} to speak with someone!`,
        to
      );
    }
  }

  return NextResponse.json({ ok: true });
}
