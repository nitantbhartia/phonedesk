import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { normalizePhoneNumber } from "@/lib/phone";
import { resolveBusinessFromDemo } from "@/lib/demo-session";
import { canCancelAppointment } from "@/lib/appointment-state";
import { sendSms } from "@/lib/sms";
import { formatDateTime } from "@/lib/utils";

// Retell custom tool endpoint: reschedules an upcoming appointment to a new time.
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
  const {
    new_start_time: newStartTimeRaw,
    appointment_id: appointmentId,
    pet_name: petName,
    customer_name: customerName,
  } = args || {};

  if (!newStartTimeRaw) {
    return NextResponse.json({
      result: "I need a new date and time to reschedule — please check availability first.",
      rescheduled: false,
    });
  }

  const newStartTime = new Date(newStartTimeRaw);
  if (isNaN(newStartTime.getTime())) {
    return NextResponse.json({
      result: "The new time I received doesn't look right. Let me check availability again.",
      rescheduled: false,
    });
  }

  // Identify business
  const calledNumber = normalizePhoneNumber(call?.to_number);
  let phoneRecord = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: { include: { phoneNumber: true } } },
      })
    : null;

  if (!phoneRecord && calledNumber) {
    const demoBusinessId = await resolveBusinessFromDemo(calledNumber);
    if (demoBusinessId) {
      const demoBusiness = await prisma.business.findUnique({
        where: { id: demoBusinessId },
        include: { phoneNumber: true },
      });
      if (demoBusiness) {
        phoneRecord = { businessId: demoBusinessId, business: demoBusiness } as unknown as typeof phoneRecord;
      }
    }
  }

  if (!phoneRecord?.business) {
    return NextResponse.json({
      result: "I wasn't able to reach the booking system right now. Please call back to reschedule.",
      rescheduled: false,
    });
  }

  const business = phoneRecord.business;
  const callerPhone = normalizePhoneNumber(call?.from_number);
  const now = new Date();
  const timezone = business.timezone || "America/Los_Angeles";

  // --- Targeted lookup by appointment_id ---
  if (appointmentId) {
    const appointment = await prisma.appointment.findFirst({
      where: {
        id: appointmentId,
        businessId: business.id,
        status: { not: "CANCELLED" },
        startTime: { gte: now },
        ...(callerPhone ? { customerPhone: callerPhone } : {}),
      },
    });
    if (!appointment) {
      return NextResponse.json({
        result: "I couldn't find that appointment. It may already have been cancelled.",
        rescheduled: false,
      });
    }
    return rescheduleAndNotify(appointment, newStartTime, business, timezone);
  }

  // --- Broad lookup ---
  if (!callerPhone && !customerName) {
    return NextResponse.json({
      result: "I need a name to find the appointment — what's the name on the booking?",
      rescheduled: false,
    });
  }

  const appointments = await prisma.appointment.findMany({
    where: {
      businessId: business.id,
      status: { not: "CANCELLED" },
      startTime: { gte: now },
      ...(callerPhone
        ? { customerPhone: callerPhone }
        : { customerName: { contains: customerName!, mode: "insensitive" } }),
      ...(petName ? { petName: { contains: petName, mode: "insensitive" } } : {}),
    },
    orderBy: { startTime: "asc" },
  });

  if (appointments.length === 0) {
    return NextResponse.json({
      result: "I couldn't find an upcoming appointment to reschedule. It may have already been cancelled.",
      rescheduled: false,
    });
  }

  if (appointments.length > 1) {
    const listed = appointments
      .map((a) => {
        const t = a.startTime.toLocaleString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: timezone,
        });
        return `${a.petName ?? "your pet"}'s ${a.serviceName ?? "appointment"} on ${t}`;
      })
      .join(", and ");

    return NextResponse.json({
      rescheduled: false,
      multiple_appointments: appointments.map((a) => ({
        appointment_id: a.id,
        pet_name: a.petName,
        service: a.serviceName,
        display_time: a.startTime.toLocaleString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
          timeZone: timezone,
        }),
      })),
      result: `I found ${appointments.length} upcoming bookings — ${listed}. Which one would you like to reschedule?`,
    });
  }

  return rescheduleAndNotify(appointments[0], newStartTime, business, timezone);
}

async function rescheduleAndNotify(
  appointment: {
    id: string;
    businessId: string;
    startTime: Date;
    serviceName: string | null;
    petName: string | null;
    customerName: string | null;
    customerPhone: string | null;
    status: string;
  },
  newStartTime: Date,
  business: {
    id: string;
    name: string;
    ownerName: string;
    phone: string | null;
    timezone: string | null;
    phoneNumber: { number: string } | null;
  },
  timezone: string
) {
  if (!canCancelAppointment(appointment.status as Parameters<typeof canCancelAppointment>[0])) {
    return NextResponse.json({
      result:
        "I wasn't able to reschedule that appointment — it may be in progress or already completed. Please contact the salon directly.",
      rescheduled: false,
    });
  }

  const oldTimeStr = appointment.startTime.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });
  const newTimeStr = newStartTime.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { startTime: newStartTime, status: "CONFIRMED" },
  });

  // Notify owner — non-blocking
  try {
    const ownerPhone = business.phone ? normalizePhoneNumber(business.phone) : null;
    const fromNumber =
      process.env.TWILIO_PHONE_NUMBER ||
      (business.phoneNumber?.number ?? null);
    if (ownerPhone && fromNumber) {
      const msg = [
        `[RingPaw] Reschedule: ${appointment.customerName ?? "A customer"} moved`,
        `${appointment.petName ? `${appointment.petName}'s ` : ""}${appointment.serviceName ?? "appointment"}`,
        `from ${formatDateTime(appointment.startTime, business.timezone ?? undefined)}`,
        `to ${formatDateTime(newStartTime, business.timezone ?? undefined)}.`,
      ].join(" ");
      await sendSms(ownerPhone, msg, fromNumber);
    }
  } catch (err) {
    console.error("[reschedule-appointment] Owner notification failed (non-fatal):", err);
  }

  return NextResponse.json({
    result: `Done — ${appointment.petName ? `${appointment.petName}'s` : "the"} ${appointment.serviceName ?? "appointment"} has been moved from ${oldTimeStr} to ${newTimeStr}. ${business.ownerName} has been notified.`,
    rescheduled: true,
    appointment_id: appointment.id,
    new_time: newStartTime.toISOString(),
  });
}

