import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseOwnerCommand, executeCommand } from "@/lib/sms-commands";
import { normalizePhoneNumber } from "@/lib/phone";

// Retell inbound SMS webhook (set via inbound_sms_webhook_url on the phone number)
// Retell sends: { agent_id, from_number, to_number }
// We respond with optional overrides: { chat_inbound: { override_agent_id, dynamic_variables, metadata } }
// Note: Retell's inbound SMS webhook notifies us that an SMS arrived. The actual
// message content is handled by the Retell chat agent. For owner commands and
// customer keywords (CANCEL/CONFIRM), we use dynamic_variables to pass context.

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Retell inbound SMS webhook sends from_number and to_number at root level
  const from = (body.from_number || body.chat_inbound?.from_number) as string;
  const to = (body.to_number || body.chat_inbound?.to_number) as string;
  const messageBody = body.message || body.chat_inbound?.message || "";

  if (!from || !to) {
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
          status: "PENDING",
          startTime: { gte: new Date() },
        },
        orderBy: { startTime: "asc" },
      });

      if (appointment) {
        await prisma.appointment.update({
          where: { id: appointment.id },
          data: { status: "CONFIRMED" },
        });

        const { sendSms } = await import("@/lib/retell");
        await sendSms(
          from,
          `Your appointment at ${business.name} is confirmed! See you soon.`,
          to
        );
      }
    }
  }

  return NextResponse.json({ ok: true });
}
