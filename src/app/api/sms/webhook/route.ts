import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseOwnerCommand, executeCommand } from "@/lib/sms-commands";

// Retell inbound SMS webhook
// Retell sends: { event: "chat_inbound", chat_inbound: { agent_id, from_number, to_number } }
// For owner commands and customer keywords (CANCEL/CONFIRM), we handle them here.

export async function POST(req: NextRequest) {
  const body = await req.json();

  // Handle Retell inbound SMS webhook format
  const chatInbound = body.chat_inbound;
  if (!chatInbound) {
    return NextResponse.json({ ok: true });
  }

  const from = chatInbound.from_number as string;
  const to = chatInbound.to_number as string;
  const messageBody = chatInbound.message || "";

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

  // Check if this is the owner texting (from their business phone)
  if (from === business.phone) {
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
          customerPhone: from,
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
        if (business.phone) {
          await sendSms(
            business.phone,
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
          customerPhone: from,
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
