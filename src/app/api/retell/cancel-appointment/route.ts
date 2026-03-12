import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { normalizePhoneNumber } from "@/lib/phone";
import { resolveBusinessFromDemo } from "@/lib/demo-session";
import { sendCancellationWithWaitlistNotification } from "@/lib/notifications";
import { canCancelAppointment } from "@/lib/appointment-state";
import { tryFillFromWaitlist } from "@/lib/waitlist";

// Retell custom tool endpoint: cancels an upcoming appointment for the caller.
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
    customer_name: customerName,
    pet_name: petName,
    appointment_id: appointmentId,
  } = args || {};

  // Identify business from the called number
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
      result: "I wasn't able to reach the booking system right now. Please call back to cancel.",
      cancelled: false,
    });
  }

  const business = phoneRecord.business;
  const callerPhone = normalizePhoneNumber(call?.from_number);
  const now = new Date();
  const timezone = business.timezone || "America/Los_Angeles";

  // --- If the agent already has a specific appointment_id (from a prior disambiguation) ---
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
        cancelled: false,
      });
    }
    return cancelAndNotify(appointment, business, timezone);
  }

  // --- Otherwise look up all upcoming appointments for this caller ---
  if (!callerPhone && !customerName) {
    return NextResponse.json({
      result: "I need a name to look up the appointment — what's the name on the booking?",
      cancelled: false,
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
      result: "I couldn't find an upcoming appointment for you here. It may have already been cancelled.",
      cancelled: false,
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
      cancelled: false,
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
      result: `I found ${appointments.length} upcoming bookings — ${listed}. Which one would you like to cancel?`,
    });
  }

  return cancelAndNotify(appointments[0], business, timezone);
}

async function cancelAndNotify(
  appointment: {
    id: string;
    businessId: string;
    startTime: Date;
    serviceName: string | null;
    petName: string | null;
    status: string;
  },
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
        "I wasn't able to cancel that appointment — it may be in progress or already completed. Please contact the salon directly.",
      cancelled: false,
    });
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "CANCELLED" },
  });

  const waitlistMatch = await tryFillFromWaitlist({ ...appointment, business });

  try {
    await sendCancellationWithWaitlistNotification(
      business as Parameters<typeof sendCancellationWithWaitlistNotification>[0],
      appointment as Parameters<typeof sendCancellationWithWaitlistNotification>[1],
      waitlistMatch?.customerName
    );
  } catch (err) {
    console.error("[cancel-appointment] Owner notification failed (non-fatal):", err);
  }

  const timeStr = appointment.startTime.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });

  return NextResponse.json({
    result: `Done — ${appointment.petName ? `${appointment.petName}'s` : "the"} ${appointment.serviceName} on ${timeStr} has been cancelled. ${business.ownerName} has been notified.`,
    cancelled: true,
    appointment_id: appointment.id,
  });
}
