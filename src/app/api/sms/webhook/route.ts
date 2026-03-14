import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parseOwnerCommand, executeCommand } from "@/lib/sms-commands";
import { normalizePhoneNumber } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";
import { isRetellAuthorized } from "@/lib/retell-auth";
import { handleCustomerSms } from "@/lib/sms-ai";

/** Return an empty TwiML response (Twilio requires text/xml Content-Type) */
function twimlOk() {
  return new Response(
    '<?xml version="1.0" encoding="UTF-8"?><Response></Response>',
    { status: 200, headers: { "Content-Type": "text/xml" } }
  );
}

type InboundSource = "retell" | "twilio";

type InboundPayload = {
  source: InboundSource;
  from: string;
  to: string;
  messageBody: string;
  twilioFormData?: FormData;
};

function getPublicRequestUrl(req: NextRequest) {
  const url = new URL(req.url);
  const proto =
    req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return `${proto}://${host || url.host}${url.pathname}${url.search}`;
}

function verifyTwilioSignature(req: NextRequest, formData: FormData) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return true;
  }

  const signature = req.headers.get("x-twilio-signature");
  if (!signature) {
    return false;
  }

  const params = Array.from(formData.entries())
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const data =
    getPublicRequestUrl(req) +
    params.map(([key, value]) => `${key}${value}`).join("");
  const expected = createHmac("sha1", authToken).update(data).digest("base64");

  const sigBuf = Buffer.from(signature, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length) {
    return false;
  }

  return timingSafeEqual(sigBuf, expBuf);
}

async function parseInboundPayload(req: NextRequest): Promise<InboundPayload> {
  const contentType = req.headers.get("content-type") || "";

  if (contentType.includes("application/x-www-form-urlencoded")) {
    const formData = await req.formData();
    return {
      source: "twilio",
      from: String(formData.get("From") || "").trim(),
      to: String(formData.get("To") || "").trim(),
      messageBody: String(formData.get("Body") || "").trim(),
      twilioFormData: formData,
    };
  }

  const body = await req.json().catch(() => ({}));
  return {
    source: "retell",
    from: String(body.from_number || body.chat_inbound?.from_number || "").trim(),
    to: String(body.to_number || body.chat_inbound?.to_number || "").trim(),
    messageBody: String(
      body.message || body.text || body.chat_inbound?.message || ""
    ).trim(),
  };
}

async function sendSmsReply(to: string, body: string, from: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const twilioFrom = process.env.TWILIO_PHONE_NUMBER || from;

  if (accountSid && authToken) {
    const payload = new URLSearchParams({
      To: to,
      From: twilioFrom,
      Body: body,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${accountSid}:${authToken}`
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: payload.toString(),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Twilio SMS error: ${text}`);
    }
    return;
  }

  const { sendSms } = await import("@/lib/retell");
  await sendSms(to, body, from);
}

export async function POST(req: NextRequest) {
  const inbound = await parseInboundPayload(req);
  const { source, from, to, messageBody, twilioFormData } = inbound;

  if (source === "retell" && !isRetellAuthorized(req)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!from || !to) {
    return source === "twilio" ? twimlOk() : NextResponse.json({ ok: true });
  }

  if (
    source === "twilio" &&
    twilioFormData &&
    !verifyTwilioSignature(req, twilioFormData)
  ) {
    console.warn("[SMS Webhook] Twilio signature verification failed — rejecting request");
    return twimlOk();
  }

  const { allowed } = rateLimit(`sms:${from}`, { limit: 20, windowMs: 60_000 });
  if (!allowed) {
    return source === "twilio" ? twimlOk() : NextResponse.json({ ok: true });
  }

  await prisma.smsLog.create({
    data: {
      direction: "INBOUND",
      fromNumber: from,
      toNumber: to,
      body: messageBody,
    },
  });

  const phoneRecord = await prisma.phoneNumber.findFirst({
    where: { number: to },
    include: { business: true },
  });

  if (!phoneRecord?.business) {
    return source === "twilio" ? twimlOk() : NextResponse.json({ ok: true });
  }

  const business = phoneRecord.business;
  const normalizedFrom = normalizePhoneNumber(from);
  const normalizedBusinessPhone = normalizePhoneNumber(business.phone);

  if (
    normalizedFrom &&
    normalizedBusinessPhone &&
    normalizedFrom === normalizedBusinessPhone
  ) {
    try {
      const command = await parseOwnerCommand(messageBody);
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
      console.error("[SMS Webhook] Error processing owner command:", error);
      await sendSmsReply(
        from,
        "[RingPaw] Sorry, I had trouble processing that. Try again or text 'help' for available commands.",
        to
      );
    }
  } else {
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

        await sendSmsReply(
          from,
          `Your appointment at ${business.name} has been cancelled. Call us to reschedule!`,
          to
        );

        if (normalizedBusinessPhone) {
          await sendSmsReply(
            normalizedBusinessPhone,
            `[RingPaw] ${appointment.customerName} cancelled their ${
              appointment.serviceName || "grooming"
            } appointment.`,
            to
          );
        }
      } else {
        await sendSmsReply(
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

        await sendSmsReply(
          from,
          `Your appointment at ${business.name} is confirmed! See you soon. 🐾`,
          to
        );

        if (normalizedBusinessPhone) {
          const { formatDateTime } = await import("@/lib/utils");
          await sendSmsReply(
            normalizedBusinessPhone,
            `[RingPaw] ${appointment.customerName} confirmed their ${
              appointment.serviceName || "grooming"
            } appointment (${formatDateTime(appointment.startTime)}).`,
            to
          );
        }
      }
    } else if (upperBody === "BOOK") {
      const waitlistEntry = await prisma.waitlistEntry.findFirst({
        where: {
          businessId: business.id,
          customerPhone: from,
          status: "NOTIFIED",
        },
        orderBy: { notifiedAt: "desc" },
      });

      if (waitlistEntry) {
        const { bookAppointment, isSlotAvailable } = await import("@/lib/calendar");
        const startTime = waitlistEntry.preferredDate;
        const serviceDuration = 60;
        const endTime = new Date(startTime.getTime() + serviceDuration * 60000);

        const slotOpen = await isSlotAvailable(business.id, startTime, endTime);

        if (!slotOpen) {
          await sendSmsReply(
            from,
            "Sorry, that slot was just taken. We'll let you know when the next opening comes up!",
            to
          );
        } else {
          await bookAppointment(business.id, {
            customerName: waitlistEntry.customerName,
            customerPhone: waitlistEntry.customerPhone,
            petName: waitlistEntry.petName || undefined,
            petBreed: waitlistEntry.petBreed || undefined,
            petSize: waitlistEntry.petSize || undefined,
            serviceName: waitlistEntry.serviceName || undefined,
            startTime,
            endTime,
          });

          await prisma.waitlistEntry.update({
            where: { id: waitlistEntry.id },
            data: { status: "BOOKED", bookedAt: new Date() },
          });

          await sendSmsReply(
            from,
            `Great — you're booked! We'll see ${
              waitlistEntry.petName || "your pet"
            } at ${business.name} soon. Reply CANCEL if plans change.`,
            to
          );

          if (normalizedBusinessPhone) {
            await sendSmsReply(
              normalizedBusinessPhone,
              `[RingPaw] Waitlist fill! ${waitlistEntry.customerName} booked the opening for ${
                waitlistEntry.petName || "their pet"
              }.`,
              to
            );
          }
        }
      }
    } else if (upperBody === "REBOOK") {
      const lastCompleted = await prisma.appointment.findFirst({
        where: {
          businessId: business.id,
          customerPhone: { in: [from, normalizedFrom || from] },
          status: "COMPLETED",
        },
        orderBy: { completedAt: "desc" },
      });

      if (lastCompleted) {
        const petName = lastCompleted.petName || "your pet";
        await sendSmsReply(
          from,
          `Great! Call us at ${business.phone || to} and we'll get ${petName} scheduled. Or text us your preferred date/time and we'll check availability!`,
          to
        );
      } else {
        await sendSmsReply(
          from,
          `We'd love to book you in! Call us at ${business.phone || to} to schedule an appointment.`,
          to
        );
      }
    } else if (upperBody === "STATUS") {
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
            statusMessage = `${petName} is ready for pickup! Head to ${
              business.address || business.name
            }.`;
            break;
          case "PICKED_UP":
            statusMessage = `All done! Hope ${petName} feels great.`;
            break;
          default:
            statusMessage = `Your appointment is scheduled for ${formatDateTime(
              appointment.startTime
            )}. We'll update you when ${petName} is checked in!`;
            break;
        }

        await sendSmsReply(from, statusMessage, to);
      } else {
        await sendSmsReply(
          from,
          `No appointment found for today. Call ${business.name} for details.`,
          to
        );
      }
    } else if (messageBody.trim()) {
      // Free-form message — hand off to AI
      try {
        const aiReply = await handleCustomerSms({
          businessId: business.id,
          customerPhone: normalizedFrom || from,
          messageBody,
        });
        if (aiReply) {
          await sendSmsReply(from, aiReply, to);
        }
      } catch (err) {
        console.error("[SMS Webhook] AI handler error:", err);
        await sendSmsReply(
          from,
          `Hi! Thanks for texting ${business.name}. Reply CONFIRM, CANCEL, or STATUS — or call us at ${business.phone || to}.`,
          to
        );
      }
    }
  }

  return source === "twilio" ? twimlOk() : NextResponse.json({ ok: true });
}
