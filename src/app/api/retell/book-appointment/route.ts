import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bookAppointment, isSlotAvailable, parseLocalDatetime } from "@/lib/calendar";
import {
  sendBookingNotificationToOwner,
  sendBookingConfirmationToCustomer,
} from "@/lib/notifications";
import { normalizePhoneNumber } from "@/lib/phone";
import { upsertCustomerMemory } from "@/lib/customer-memory";
import { sendSms } from "@/lib/retell";

// Retell custom tool endpoint: called by the voice agent during a call
// to book an appointment with the collected customer/pet details.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { args, call } = body;

  console.log("[book-appointment] args:", JSON.stringify(args), "from:", call?.from_number, "to:", call?.to_number);

  // Identify business from the called number
  const calledNumber = call?.to_number;
  const phoneNum = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: { include: { services: true } } },
      })
    : null;

  if (!phoneNum?.business) {
    return NextResponse.json({
      result: "I apologize, but I'm having trouble accessing the booking system right now. Can you hold on a moment while I try again?",
    });
  }

  const business = phoneNum.business;

  const {
    customer_name: customerName,
    customer_phone: customerPhone,
    pet_name: petName,
    pet_breed: petBreed,
    pet_size: petSize,
    service_name: svcName,
    start_time: startTime,
  } = args || {};

  if (!customerName || !startTime) {
    return NextResponse.json({
      result: "I still need the customer's name and appointment time before I can book this.",
      booked: false,
    });
  }

  const service = svcName
    ? business.services.find(
        (s) =>
          s.isActive &&
          s.name.toLowerCase().includes(svcName.toLowerCase())
      )
    : null;

  const timezone = business.timezone || "America/Los_Angeles";

  // Auto-correct bad dates: the AI model sometimes hallucinates wrong years/months
  // (e.g. 2024-05-21T09:00:00 instead of 2026-03-13T09:00:00).
  let correctedStartTime = startTime;
  if (correctedStartTime && !(/Z|[+-]\d{2}:\d{2}$/.test(correctedStartTime))) {
    const dateMatch = correctedStartTime.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
      const dateOnly = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;

      // Fix past dates by correcting the year
      if (dateOnly < todayStr) {
        const [currentYear] = todayStr.split("-");
        let correctedDate = `${currentYear}-${dateMatch[2]}-${dateMatch[3]}`;
        if (correctedDate < todayStr) {
          correctedDate = `${Number(currentYear) + 1}-${dateMatch[2]}-${dateMatch[3]}`;
        }
        correctedStartTime = correctedStartTime.replace(
          `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`,
          correctedDate
        );
        console.warn("[book-appointment] Auto-corrected past date:", startTime, "→", correctedStartTime);
      }

      // Fix future dates that are unreasonably far out (>60 days).
      // The agent likely hallucinated the wrong month — preserve the day-of-week
      // and time but find the nearest matching weekday from today.
      const correctedDateOnly = correctedStartTime.slice(0, 10);
      const todayDate = new Date(todayStr + "T12:00:00Z");
      const targetDate = new Date(correctedDateOnly + "T12:00:00Z");
      const daysDiff = Math.round((targetDate.getTime() - todayDate.getTime()) / 86400000);
      if (daysDiff > 60) {
        // Find the next occurrence of the same weekday within the next 14 days
        const targetDow = targetDate.getUTCDay();
        for (let i = 0; i <= 14; i++) {
          const candidate = new Date(todayDate.getTime() + i * 86400000);
          if (candidate.getUTCDay() === targetDow) {
            const fixedDate = candidate.toISOString().slice(0, 10);
            correctedStartTime = correctedStartTime.replace(correctedDateOnly, fixedDate);
            console.warn("[book-appointment] Auto-corrected far-future date:", startTime, "→", correctedStartTime, `(was ${daysDiff} days out)`);
            break;
          }
        }
      }
    }
  }

  const start = parseLocalDatetime(correctedStartTime, timezone);
  const end = new Date(start.getTime() + (service?.duration || 60) * 60000);

  if (Number.isNaN(start.getTime())) {
    return NextResponse.json({
      result: "That time didn't come through clearly. Could you repeat the appointment time?",
      booked: false,
    });
  }

  try {
    const normalizedCustomerPhone = normalizePhoneNumber(
      customerPhone || call?.from_number
    );

    const slotOpen = await isSlotAvailable(business.id, start, end);
    if (!slotOpen) {
      return NextResponse.json({
        result: "That slot is no longer available. Let me offer you another time.",
        booked: false,
        timezone,
      });
    }

    const appointment = await bookAppointment(business.id, {
      customerName,
      customerPhone: normalizedCustomerPhone || customerPhone || call?.from_number,
      petName,
      petBreed,
      petSize: petSize as "SMALL" | "MEDIUM" | "LARGE" | "XLARGE",
      serviceName: service?.name || svcName,
      servicePrice: service?.price,
      startTime: start,
      endTime: end,
    });

    await upsertCustomerMemory({
      businessId: business.id,
      customerName,
      customerPhone: normalizedCustomerPhone || customerPhone || call?.from_number,
      petName,
      petBreed,
      petSize: petSize as "SMALL" | "MEDIUM" | "LARGE" | "XLARGE",
      serviceName: service?.name || svcName,
      appointmentStart: start,
    });

    // Link call to appointment
    if (call?.call_id) {
      await prisma.call.updateMany({
        where: { retellCallId: call.call_id },
        data: { appointmentId: appointment.id },
      });
    }

    // Send notifications
    const fullBusiness = await prisma.business.findUnique({
      where: { id: business.id },
      include: { phoneNumber: true },
    });

    if (fullBusiness) {
      const smsResults = await Promise.allSettled([
        sendBookingNotificationToOwner(
          fullBusiness as Parameters<typeof sendBookingNotificationToOwner>[0],
          appointment
        ),
        sendBookingConfirmationToCustomer(
          fullBusiness as Parameters<typeof sendBookingConfirmationToCustomer>[0],
          appointment
        ),
      ]);
      smsResults.forEach((result, i) => {
        if (result.status === "rejected") {
          console.error(`[SMS] Notification ${i === 0 ? "owner" : "customer"} failed:`, result.reason);
        }
      });
    } else {
      console.warn("[SMS] Could not fetch business with phoneNumber for notifications, businessId:", business.id);
    }

    // Auto-send intake form for new clients
    const custPhone = normalizedCustomerPhone || customerPhone || call?.from_number;
    if (custPhone) {
      try {
        const existingCustomer = await prisma.customer.findUnique({
          where: {
            businessId_phone: {
              businessId: business.id,
              phone: custPhone,
            },
          },
        });

        if (!existingCustomer || existingCustomer.visitCount === 0) {
          const intakeForm = await prisma.intakeForm.create({
            data: {
              businessId: business.id,
              customerPhone: custPhone,
              customerName: customerName,
              appointmentId: appointment.id,
            },
          });

          const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
          const intakeLink = `${appUrl}/intake/${intakeForm.token}`;
          const intakeMessage = `Hi ${customerName}! Please fill out this quick form before your visit to ${business.name}: ${intakeLink}`;

          if (fullBusiness?.phoneNumber?.number) {
            await sendSms(custPhone, intakeMessage, fullBusiness.phoneNumber.number);
          }
        }
      } catch (intakeError) {
        console.error("Failed to auto-send intake form:", intakeError);
        // Non-blocking: don't fail the booking if intake fails
      }
    }

    const timeStr = start.toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      timeZone: timezone,
    });

    const isConfirmed = appointment.status === "CONFIRMED";
    const resultMessage = isConfirmed
      ? `I've booked ${petName || "your pet"} for a ${service?.name || svcName || "grooming"} appointment on ${timeStr}. You're all set! You'll receive a confirmation text shortly.`
      : `I've got ${timeStr} held for ${petName || "your pet"}'s ${service?.name || svcName || "grooming"} appointment. The groomer will send you a confirmation text shortly to lock it in.`;

    return NextResponse.json({
      result: resultMessage,
      booked: true,
      confirmed: isConfirmed,
      appointment_id: appointment.id,
      timezone,
    });
  } catch (error) {
    console.error("Error booking appointment:", error);
    return NextResponse.json({
      result: "I wasn't able to complete the booking just now. Can we try that again? Let me re-check the time slot.",
      booked: false,
    });
  }
}
