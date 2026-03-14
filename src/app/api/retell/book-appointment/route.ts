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
import { getStripeClient } from "@/lib/stripe";
import { resolveBusinessFromDemo } from "@/lib/demo-session";
import { resolveActiveService } from "@/lib/retell-tool-helpers";

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
  let phoneNum = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: { include: { services: true } } },
      })
    : null;

  // Demo number fallback: during onboarding test calls, the called number is a
  // shared demo number with no PhoneNumber record — look up via DemoSession.
  // Track whether this is a test/demo call so billing is not triggered.
  let isTestBooking = false;
  if (!phoneNum && calledNumber) {
    const demoBusinessId = await resolveBusinessFromDemo(calledNumber);
    if (demoBusinessId) {
      const demoBusiness = await prisma.business.findUnique({
        where: { id: demoBusinessId },
        include: { services: true },
      });
      if (demoBusiness) {
        phoneNum = { businessId: demoBusinessId, business: demoBusiness } as unknown as typeof phoneNum;
        isTestBooking = true;
      }
    }
  }

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
    service_id: serviceId,
    service_name: svcName,
    addon_service_id: addonServiceId,
    addon_service_name: addonSvcName,
    start_time: startTime,
    square_customer_id: squareCustomerId,
    groomer_name: groomerName,
  } = args || {};

  if (!customerName || !startTime || (!serviceId?.trim() && !svcName?.trim())) {
    return NextResponse.json({
      result:
        "I still need the customer's name, service, and appointment time before I can book this.",
      booked: false,
    });
  }

  const VALID_SIZES = ["SMALL", "MEDIUM", "LARGE", "XLARGE"];
  const normalizedPetSize = petSize ? petSize.toUpperCase() : null;
  const validatedPetSize = normalizedPetSize && VALID_SIZES.includes(normalizedPetSize)
    ? (normalizedPetSize as "SMALL" | "MEDIUM" | "LARGE" | "XLARGE")
    : undefined;

  const service = resolveActiveService<Service>(business.services, {
    serviceId,
    serviceName: svcName,
  });

  // Reject if the requested service didn't match anything on file — prevents
  // bookings with wrong duration, null price, and unrecognised service name.
  if (!service) {
    const activeNames = business.services
      .filter((s: Service) => s.isActive)
      .map((s: Service) => s.name)
      .join(", ");
    return NextResponse.json({
      result: `I wasn't able to match "${svcName}" to a service on file. Available services are: ${activeNames || "none"}. Can you clarify which service the customer wants?`,
      booked: false,
    });
  }

  // Look up add-on service if the AI offered one
  const addonService = addonSvcName
    || addonServiceId
    ? resolveActiveService<Service>(
        business.services.filter((entry: Service) => entry.isAddon),
        {
          serviceId: addonServiceId,
          serviceName: addonSvcName,
        }
      )
    : null;

  if ((addonSvcName || addonServiceId) && !addonService) {
    const addonNames = business.services
      .filter((entry: Service) => entry.isActive && entry.isAddon)
      .map((entry: Service) => entry.name)
      .join(", ");

    return NextResponse.json({
      result: `I wasn't able to match "${addonSvcName || addonServiceId}" to an add-on on file. Available add-ons are: ${addonNames || "none"}. Can you confirm whether they want an add-on?`,
      booked: false,
      addon_not_found: true,
    });
  }

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

  // If a specific groomer was requested but not found, tell the AI so it can correct itself
  if (groomerName && !groomer) {
    const activeGroomers = await prisma.groomer.findMany({
      where: { businessId: business.id, isActive: true },
      select: { name: true },
    });
    const names = activeGroomers.map((g) => g.name).join(", ");
    return NextResponse.json({
      result: `I couldn't find a groomer named "${groomerName}" on file. Available groomers are: ${names || "none"}. Please confirm the correct name with the customer or book without a groomer preference.`,
      booked: false,
      groomer_not_found: true,
    });
  }

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
  const totalDuration = service.duration + (addonService?.duration || 0);
  const end = new Date(start.getTime() + totalDuration * 60000);

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

    // Combine service name and price if add-on was accepted
    const combinedServiceName = addonService
      ? `${service.name} + ${addonService.name}`
      : service.name;
    const combinedServicePrice = addonService
      ? service.price + addonService.price
      : service.price;

    const appointment = await bookAppointment(business.id, {
      customerName,
      customerPhone: normalizedCustomerPhone || customerPhone || call?.from_number,
      petName,
      petBreed,
      petSize: validatedPetSize,
      serviceName: combinedServiceName,
      servicePrice: combinedServicePrice,
      startTime: start,
      endTime: end,
      groomerId: groomer?.id,
      isTestBooking,
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

    // Upsert customer memory — non-blocking: a save failure must never kill the booking confirmation
    let internalCustomer: Awaited<ReturnType<typeof upsertCustomerMemory>> = null;
    if (!isTestBooking) {
      try {
        internalCustomer = await upsertCustomerMemory({
          businessId: business.id,
          customerName,
          customerPhone: normalizedCustomerPhone || customerPhone || call?.from_number,
          petName,
          petBreed,
          petSize: validatedPetSize,
          serviceName: service.name,
          appointmentStart: start,
        });
      } catch (memErr) {
        console.error("[book-appointment] upsertCustomerMemory failed (non-fatal):", memErr);
      }
    }

    // Sync with external CRM: create customer record on first booking
    if (!isTestBooking && internalCustomer) {
      const custPhone = normalizedCustomerPhone || customerPhone || call?.from_number;
      try {
        const crm = await getCRMWithFallback(business.id);
        const crmType = crm.getCRMType();

        if (crmType === "square" && !squareCustomerId) {
          const squareCust = await crm.createCustomer({
            name: customerName,
            phone: custPhone || "",
          });
          await prisma.customer.update({
            where: { id: internalCustomer.id },
            data: { squareCustomerId: squareCust.id },
          });
          console.log(`[book-appointment] Created Square customer ${squareCust.id} for ${customerName}`);
        } else if (crmType === "moego" && !internalCustomer.moegoCustomerId) {
          const existingMoeGoCustomer = custPhone ? await crm.getCustomer(custPhone) : null;
          const moegoCust = existingMoeGoCustomer ?? await crm.createCustomer({
            name: customerName,
            phone: custPhone || "",
          });
          await prisma.customer.update({
            where: { id: internalCustomer.id },
            data: { moegoCustomerId: moegoCust.id },
          });
          console.log(
            `[book-appointment] ${existingMoeGoCustomer ? "Linked existing" : "Created"} MoeGo customer ${moegoCust.id} for ${customerName}`
          );
        }
      } catch (crmErr) {
        // Non-blocking: CRM customer creation failure doesn't fail the booking
        console.error(`[book-appointment] CRM customer create failed (non-fatal):`, crmErr);
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

    // Increment bookingsCount for real bookings only. Test/demo bookings are excluded
    // so that a groomer trialling the agent during onboarding isn't charged prematurely.
    // If this is the very first *real* booking during a trial, end the trial immediately
    // so the groomer is charged their plan price right now.
    if (!isTestBooking) {
      try {
        const updatedBiz = await prisma.business.update({
          where: { id: business.id },
          data: { bookingsCount: { increment: 1 } },
          select: { bookingsCount: true, stripeSubscriptionId: true, stripeSubscriptionStatus: true, phone: true },
        });

        if (
          updatedBiz.bookingsCount === 1 &&
          updatedBiz.stripeSubscriptionId &&
          updatedBiz.stripeSubscriptionStatus === "trialing"
        ) {
          // First real booking ever — end the trial now so the groomer is charged immediately
          const stripe = getStripeClient();
          await stripe.subscriptions.update(updatedBiz.stripeSubscriptionId, {
            trial_end: "now",
          });
          console.log(`[book-appointment] Trial ended for business ${business.id} — first real booking triggered immediate charge`);

          // Notify the owner via SMS that their plan is now active
          const smsFrom = process.env.TWILIO_PHONE_NUMBER || fullBusiness?.phoneNumber?.number;
          if (smsFrom && updatedBiz.phone) {
            sendSms(
              updatedBiz.phone,
              `Pip just booked your first appointment — your ${business.name} plan is now active! You're all set.`,
              smsFrom
            ).catch((e) => console.error("[book-appointment] Trial activation SMS failed:", e));
          }
        }
      } catch (countErr) {
        // Non-blocking — booking is already confirmed; billing is a side-effect
        console.error("[book-appointment] bookingsCount increment failed (non-fatal):", countErr);
      }
    } else {
      console.log(`[book-appointment] Test/demo booking for business ${business.id} — skipping bookingsCount increment and billing`);
    }

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

        const alreadySentIntake = await prisma.intakeForm.findFirst({
          where: { businessId: business.id, customerPhone: custPhone },
        });

        if ((!existingCustomer || existingCustomer.visitCount === 0) && !alreadySentIntake) {
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
    const serviceDisplay = combinedServiceName || "grooming";
    const resultMessage = isConfirmed
      ? `I've booked ${petName || "your pet"} for a ${serviceDisplay} appointment on ${timeStr}. You're all set! You'll receive a confirmation text shortly.`
      : `I've got ${timeStr} held for ${petName || "your pet"}'s ${serviceDisplay} appointment. The groomer will send you a confirmation text shortly to lock it in.`;

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
