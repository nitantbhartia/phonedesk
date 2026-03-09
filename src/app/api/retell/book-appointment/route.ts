import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Service } from "@prisma/client";
import { bookAppointment, isSlotAvailable, parseLocalDatetime } from "@/lib/calendar";
import {
  sendBookingNotificationToOwner,
  sendBookingConfirmationToCustomer,
} from "@/lib/notifications";
import { normalizePhoneNumber } from "@/lib/phone";
import { upsertCustomerMemory } from "@/lib/customer-memory";
import { sendSms } from "@/lib/sms";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { getCRMWithFallback } from "@/crm/withFallback";

// Retell custom tool endpoint: called by the voice agent during a call
// to book an appointment with the collected customer/pet details.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-retell-signature") || "";

  if (!isRetellWebhookValid(rawBody, signature, req.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { args?: Record<string, string>; call?: Record<string, string> };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { args, call } = body;

  console.log("[book-appointment] service:", args?.service_name, "pet:", args?.pet_name, "to:", call?.to_number, "from:", call?.from_number, "customer_phone arg:", args?.customer_phone);

  // Identify business from the called number
  const calledNumber = normalizePhoneNumber(call?.to_number);
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
    square_customer_id: squareCustomerId,
    groomer_name: groomerName,
  } = args || {};

  if (!customerName || !startTime) {
    return NextResponse.json({
      result: "I still need the customer's name and appointment time before I can book this.",
      booked: false,
    });
  }

  const VALID_SIZES = ["SMALL", "MEDIUM", "LARGE", "XLARGE"];
  const normalizedPetSize = petSize ? petSize.toUpperCase() : null;
  const validatedPetSize = normalizedPetSize && VALID_SIZES.includes(normalizedPetSize)
    ? (normalizedPetSize as "SMALL" | "MEDIUM" | "LARGE" | "XLARGE")
    : undefined;

  const service = svcName
    ? business.services.find(
        (s: Service) =>
          s.isActive &&
          s.name.toLowerCase().includes(svcName.toLowerCase())
      )
    : null;

  // Match groomer by name if requested
  const groomer = groomerName
    ? await prisma.groomer.findFirst({
        where: {
          businessId: business.id,
          isActive: true,
          name: { contains: groomerName, mode: "insensitive" },
        },
      })
    : null;

  const timezone = business.timezone || "America/Los_Angeles";

  // Auto-correct past dates: the AI model sometimes hallucinates old years
  // (e.g. 2024-05-21T09:00:00 instead of 2026-05-21T09:00:00).
  let correctedStartTime = startTime;
  if (correctedStartTime && !(/Z|[+-]\d{2}:\d{2}$/.test(correctedStartTime))) {
    const dateMatch = correctedStartTime.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (dateMatch) {
      const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
      const dateOnly = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;

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
      petSize: validatedPetSize,
      serviceName: service?.name || svcName,
      servicePrice: service?.price,
      startTime: start,
      endTime: end,
      groomerId: groomer?.id,
    });

    // Save groomer preference on customer record
    if (groomer) {
      const custPhone = normalizePhoneNumber(customerPhone || call?.from_number);
      if (custPhone) {
        await prisma.customer.updateMany({
          where: {
            businessId: business.id,
            phone: custPhone,
          },
          data: { preferredGroomerId: groomer.id },
        });
      }
    }

    const internalCustomer = await upsertCustomerMemory({
      businessId: business.id,
      customerName,
      customerPhone: normalizedCustomerPhone || customerPhone || call?.from_number,
      petName,
      petBreed,
      petSize: validatedPetSize,
      serviceName: service?.name || svcName,
      appointmentStart: start,
    });

    // Sync with Square CRM: create customer in Square if this is a new customer
    if (internalCustomer && !squareCustomerId) {
      try {
        const crm = await getCRMWithFallback(business.id);
        if (crm.getCRMType() === "square") {
          const custPhone = normalizedCustomerPhone || customerPhone || call?.from_number;
          const squareCust = await crm.createCustomer({
            name: customerName,
            phone: custPhone || "",
          });
          // Store Square customer ID for future calls
          await prisma.customer.update({
            where: { id: internalCustomer.id },
            data: { squareCustomerId: squareCust.id },
          });
          console.log(`[book-appointment] Created Square customer ${squareCust.id} for ${customerName}`);
        }
      } catch (crmErr) {
        // Non-blocking: Square customer creation failure doesn't fail the booking
        console.error("[book-appointment] Square customer create failed (non-fatal):", crmErr);
      }
    }

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

          const smsFrom = process.env.TWILIO_PHONE_NUMBER || fullBusiness?.phoneNumber?.number;
          if (smsFrom) {
            await sendSms(custPhone, intakeMessage, smsFrom);
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
