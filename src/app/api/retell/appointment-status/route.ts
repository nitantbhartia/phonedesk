import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  formatRetellDateTime,
  getTodayBoundsInTimezone,
  parseRetellRequest,
  resolveRetellBusiness,
} from "@/lib/retell-tool-helpers";
import { normalizePhoneNumber } from "@/lib/phone";

export async function POST(req: NextRequest) {
  const parsed = await parseRetellRequest(req);
  if (parsed instanceof NextResponse) {
    return parsed;
  }

  const { args, call } = parsed;
  const business = await resolveRetellBusiness(call.to_number);
  if (!business) {
    return NextResponse.json({
      result:
        "I wasn't able to pull up the appointment status right now. Please call back in a moment.",
      found: false,
    });
  }

  const callerPhone = normalizePhoneNumber(call.from_number);
  const customerName = args.customer_name?.trim();
  const petName = args.pet_name?.trim();
  const appointmentId = args.appointment_id?.trim();
  const timezone = business.timezone || "America/Los_Angeles";
  const now = new Date();

  if (!callerPhone && !customerName && !appointmentId) {
    return NextResponse.json({
      result:
        "I need the name on the booking before I can look up today's appointment status.",
      found: false,
    });
  }

  const targeted = appointmentId
    ? await prisma.appointment.findFirst({
        where: {
          id: appointmentId,
          businessId: business.id,
          ...(callerPhone ? { customerPhone: callerPhone } : {}),
        },
      })
    : null;

  if (appointmentId && !targeted) {
    return NextResponse.json({
      result:
        "I couldn't find that appointment status right now. It may have changed already.",
      found: false,
    });
  }

  const candidates = targeted
    ? [targeted]
    : await findStatusCandidates({
        businessId: business.id,
        callerPhone,
        customerName,
        petName,
        timezone,
        now,
      });

  if (candidates.length === 0) {
    return NextResponse.json({
      result:
        "I don't see an active appointment for today right now. If you want, I can check the next upcoming appointment instead.",
      found: false,
    });
  }

  if (candidates.length > 1) {
    return NextResponse.json({
      found: true,
      multiple_appointments: candidates.map((appointment) => ({
        appointment_id: appointment.id,
        pet_name: appointment.petName,
        service: appointment.serviceName,
        display_time: formatRetellDateTime(appointment.startTime, timezone),
      })),
      result: `I found ${candidates.length} appointments for today. Which pet would you like me to check on?`,
    });
  }

  const appointment = candidates[0];
  return NextResponse.json({
    found: true,
    appointment_id: appointment.id,
    status: appointment.groomingStatus || appointment.status,
    result: buildStatusMessage(appointment, business.name, business.address, timezone, now),
  });
}

async function findStatusCandidates(input: {
  businessId: string;
  callerPhone: string | null;
  customerName?: string;
  petName?: string;
  timezone: string;
  now: Date;
}) {
  const { businessId, callerPhone, customerName, petName, timezone, now } = input;
  const todayBounds = getTodayBoundsInTimezone(timezone, now);

  const todaysAppointments = await prisma.appointment.findMany({
    where: {
      businessId,
      startTime: { gte: todayBounds.start, lte: todayBounds.end },
      status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
      ...(callerPhone
        ? { customerPhone: callerPhone }
        : { customerName: { contains: customerName!, mode: "insensitive" } }),
      ...(petName ? { petName: { contains: petName, mode: "insensitive" } } : {}),
    },
    orderBy: { startTime: "asc" },
  });

  const liveAppointments = todaysAppointments.filter(
    (appointment) =>
      appointment.groomingStatus &&
      appointment.groomingStatus !== "PICKED_UP"
  );
  if (liveAppointments.length === 1) {
    return liveAppointments;
  }

  if (todaysAppointments.length > 0) {
    return todaysAppointments;
  }

  const nextAppointment = await prisma.appointment.findMany({
    where: {
      businessId,
      startTime: { gte: now },
      status: { in: ["PENDING", "CONFIRMED"] },
      ...(callerPhone
        ? { customerPhone: callerPhone }
        : { customerName: { contains: customerName!, mode: "insensitive" } }),
      ...(petName ? { petName: { contains: petName, mode: "insensitive" } } : {}),
    },
    orderBy: { startTime: "asc" },
    take: 1,
  });

  return nextAppointment;
}

function buildStatusMessage(
  appointment: {
    petName: string | null;
    serviceName: string | null;
    startTime: Date;
    status: string;
    groomingStatus: string | null;
  },
  businessName: string,
  address: string | null,
  timezone: string,
  now: Date
) {
  const petLabel = appointment.petName || "Your pet";
  const timeLabel = formatRetellDateTime(appointment.startTime, timezone);

  if (appointment.groomingStatus === "READY_FOR_PICKUP") {
    return `${petLabel} is ready for pickup now. You can head to ${address || businessName}.`;
  }

  if (appointment.groomingStatus === "IN_PROGRESS") {
    return `${petLabel} is currently being groomed. We'll let you know as soon as they're ready.`;
  }

  if (appointment.groomingStatus === "CHECKED_IN") {
    return `${petLabel} is checked in with the team at ${businessName}. They're not quite ready yet.`;
  }

  if (appointment.groomingStatus === "PICKED_UP") {
    return `${petLabel} has already been picked up.`;
  }

  if (appointment.status === "COMPLETED") {
    return `${petLabel}'s ${appointment.serviceName || "appointment"} has already been completed.`;
  }

  if (appointment.startTime > now) {
    return `${petLabel} is still scheduled for ${timeLabel}. I don't have a live grooming update yet because that appointment hasn't started.`;
  }

  return `${petLabel} is on today's schedule at ${businessName}, but I don't have a live status update yet. Their appointment time is ${timeLabel}.`;
}
