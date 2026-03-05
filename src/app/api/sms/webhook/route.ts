import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseOwnerCommand, executeCommand } from "@/lib/sms-commands";

export async function POST(req: NextRequest) {
  // Parse Twilio webhook body (form-encoded)
  const formData = await req.formData();
  const from = formData.get("From") as string;
  const to = formData.get("To") as string;
  const body = formData.get("Body") as string;
  const messageSid = formData.get("MessageSid") as string;

  if (!from || !to || !body) {
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { "Content-Type": "text/xml" } }
    );
  }

  // Log inbound SMS
  await prisma.smsLog.create({
    data: {
      direction: "INBOUND",
      fromNumber: from,
      toNumber: to,
      body,
      twilioSid: messageSid,
    },
  });

  // Find the business by RingPaw number
  const twilioNumber = await prisma.twilioNumber.findFirst({
    where: { phoneNumber: to },
    include: { business: true },
  });

  if (!twilioNumber?.business) {
    return new NextResponse(
      '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
      { headers: { "Content-Type": "text/xml" } }
    );
  }

  const business = twilioNumber.business;

  // Check if this is the owner texting (from their business phone)
  if (from === business.phone) {
    // Owner SMS command
    try {
      const command = await parseOwnerCommand(body);

      // Log parsed intent
      await prisma.smsLog.updateMany({
        where: { twilioSid: messageSid },
        data: { intent: command.intent, businessId: business.id },
      });

      await executeCommand(business.id, command, from, to);
    } catch (error) {
      console.error("Error processing owner command:", error);
      // Send error response to owner
      const { sendSms } = await import("@/lib/twilio");
      await sendSms(
        from,
        "[RingPaw] Sorry, I had trouble processing that. Try again or text 'help' for available commands.",
        to
      );
    }
  } else {
    // Customer SMS - check for CANCEL keyword
    const upperBody = body.trim().toUpperCase();

    if (upperBody === "CANCEL") {
      // Find their upcoming appointment
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

        const { sendSms } = await import("@/lib/twilio");
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
        const { sendSms } = await import("@/lib/twilio");
        await sendSms(
          from,
          `No upcoming appointment found. Call ${business.name} to make changes.`,
          to
        );
      }
    } else if (upperBody === "CONFIRM") {
      // Confirm soft-booked appointment
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

        const { sendSms } = await import("@/lib/twilio");
        await sendSms(
          from,
          `Your appointment at ${business.name} is confirmed! See you soon.`,
          to
        );
      }
    }
  }

  // Respond with empty TwiML
  return new NextResponse(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { headers: { "Content-Type": "text/xml" } }
  );
}
