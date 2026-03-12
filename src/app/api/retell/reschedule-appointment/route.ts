import { NextRequest, NextResponse } from "next/server";
import type { AppointmentStatus, BookingMode, Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  bookAppointment,
  cancelAcuityAppointment,
  deleteGoogleCalendarEvent,
  deleteSquareBooking,
  isSlotAvailable,
  parseLocalDatetime,
} from "@/lib/calendar";
import { canCancelAppointment } from "@/lib/appointment-state";
import { buildConfirmLink } from "@/lib/appointment-token";
import {
  formatRetellDateTime,
  parseRetellRequest,
  resolveRetellBusiness,
} from "@/lib/retell-tool-helpers";
import { normalizePhoneNumber } from "@/lib/phone";
import { tryFillFromWaitlist } from "@/lib/waitlist";
import {
  sendRescheduleConfirmationToCustomer,
  sendRescheduleNotificationToOwner,
} from "@/lib/notifications";

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
        "I wasn't able to reach the booking system right now. Please call back and we'll help move that appointment.",
      rescheduled: false,
    });
  }

  const callerPhone = normalizePhoneNumber(call.from_number);
  const timezone = business.timezone || "America/Los_Angeles";
  const now = new Date();
  const appointmentId = args.appointment_id?.trim();
  const customerName = args.customer_name?.trim();
  const petName = args.pet_name?.trim();
  const newStartTime = args.new_start_time?.trim();

  const appointment = appointmentId
    ? await prisma.appointment.findFirst({
        where: {
          id: appointmentId,
          businessId: business.id,
          status: { not: "CANCELLED" },
          startTime: { gte: now },
          ...(callerPhone ? { customerPhone: callerPhone } : {}),
        },
      })
    : null;

  if (appointmentId && !appointment) {
    return NextResponse.json({
      result:
        "I couldn't find that appointment to move. It may already have been cancelled or changed.",
      rescheduled: false,
    });
  }

  const matchingAppointments = appointment
    ? [appointment]
    : await findMatchingAppointments({
        businessId: business.id,
        callerPhone,
        customerName,
        petName,
        now,
      });

  if (!appointment && !callerPhone && !customerName) {
    return NextResponse.json({
      result:
        "I need the name on the booking before I can help move that appointment.",
      rescheduled: false,
    });
  }

  if (matchingAppointments.length === 0) {
    return NextResponse.json({
      result:
        "I couldn't find an upcoming appointment to move for you here. It may already have changed.",
      rescheduled: false,
    });
  }

  if (matchingAppointments.length > 1) {
    return NextResponse.json({
      rescheduled: false,
      multiple_appointments: matchingAppointments.map((appt) => ({
        appointment_id: appt.id,
        pet_name: appt.petName,
        service: appt.serviceName,
        display_time: formatRetellDateTime(appt.startTime, timezone),
      })),
      result: `I found ${matchingAppointments.length} upcoming bookings. Which one would you like to move?`,
    });
  }

  const currentAppointment = matchingAppointments[0];
  if (
    !canCancelAppointment(
      currentAppointment.status as Parameters<typeof canCancelAppointment>[0]
    )
  ) {
    return NextResponse.json({
      result:
        "I wasn't able to move that appointment because it's already in progress or completed. Please contact the salon directly.",
      rescheduled: false,
    });
  }

  if (!newStartTime) {
    return NextResponse.json({
      rescheduled: false,
      appointment_id: currentAppointment.id,
      result: `I found ${currentAppointment.petName || "that appointment"} on ${formatRetellDateTime(currentAppointment.startTime, timezone)}. What new day and time would you like instead?`,
    });
  }

  const newStart = /Z|[+-]\d{2}:\d{2}$/.test(newStartTime)
    ? new Date(newStartTime)
    : parseLocalDatetime(newStartTime, timezone);

  if (Number.isNaN(newStart.getTime())) {
    return NextResponse.json({
      result:
        "That new time didn't come through clearly. Could you repeat the new appointment time?",
      rescheduled: false,
    });
  }

  if (newStart.getTime() === currentAppointment.startTime.getTime()) {
    return NextResponse.json({
      result: `${currentAppointment.petName || "That appointment"} is already set for ${formatRetellDateTime(newStart, timezone)}.`,
      rescheduled: true,
      appointment_id: currentAppointment.id,
    });
  }

  const matchedService = business.services.find(
    (service) =>
      service.isActive &&
      service.name.toLowerCase().includes((currentAppointment.serviceName || "").toLowerCase())
  );
  const durationMinutes = matchedService?.duration || 60;
  const newEnd = new Date(newStart.getTime() + durationMinutes * 60_000);

  const slotOpen = await isSlotAvailable(business.id, newStart, newEnd);
  if (!slotOpen) {
    return NextResponse.json({
      result:
        "That new slot is no longer available. Let me offer another time.",
      rescheduled: false,
      appointment_id: currentAppointment.id,
      timezone,
    });
  }

  try {
    const replacementAppointment = await bookAppointment(business.id, {
      customerName: currentAppointment.customerName,
      customerPhone: currentAppointment.customerPhone || undefined,
      petName: currentAppointment.petName || undefined,
      petBreed: currentAppointment.petBreed || undefined,
      petSize: currentAppointment.petSize || undefined,
      serviceName: currentAppointment.serviceName || undefined,
      servicePrice: currentAppointment.servicePrice || undefined,
      startTime: newStart,
      endTime: newEnd,
      notes: currentAppointment.notes || undefined,
      groomerId: currentAppointment.groomerId || undefined,
      isTestBooking: currentAppointment.isTestBooking,
    });

    const normalizedReplacement = await preserveAppointmentState(
      replacementAppointment.id,
      currentAppointment.status as AppointmentStatus,
      currentAppointment.bookingMode as BookingMode
    );

    await prisma.appointment.update({
      where: { id: currentAppointment.id },
      data: { status: "CANCELLED" },
    });

    await deleteExternalEvent(currentAppointment);

    const waitlistMatch = await tryFillFromWaitlist({
      id: currentAppointment.id,
      businessId: business.id,
      startTime: currentAppointment.startTime,
      serviceName: currentAppointment.serviceName,
      business,
    });

    try {
      await sendRescheduleNotificationToOwner(
        business as Parameters<typeof sendRescheduleNotificationToOwner>[0],
        currentAppointment as Parameters<typeof sendRescheduleNotificationToOwner>[1],
        normalizedReplacement as Parameters<typeof sendRescheduleNotificationToOwner>[2],
        waitlistMatch?.customerName
      );
    } catch (error) {
      console.error(
        "[reschedule-appointment] Owner notification failed (non-fatal):",
        error
      );
    }

    try {
      await sendRescheduleConfirmationToCustomer(
        business as Parameters<typeof sendRescheduleConfirmationToCustomer>[0],
        currentAppointment as Parameters<typeof sendRescheduleConfirmationToCustomer>[1],
        normalizedReplacement as Parameters<typeof sendRescheduleConfirmationToCustomer>[2]
      );
    } catch (error) {
      console.error(
        "[reschedule-appointment] Customer confirmation failed (non-fatal):",
        error
      );
    }

    return NextResponse.json({
      rescheduled: true,
      appointment_id: normalizedReplacement.id,
      result: `Done — ${currentAppointment.petName || "that appointment"} is now moved to ${formatRetellDateTime(normalizedReplacement.startTime, timezone)}.`,
    });
  } catch (error) {
    console.error("[reschedule-appointment] Failed to move appointment:", error);
    return NextResponse.json({
      result:
        "I wasn't able to move that appointment just yet. Let's try another time or have the owner confirm it directly.",
      rescheduled: false,
    });
  }
}

async function findMatchingAppointments(input: {
  businessId: string;
  callerPhone: string | null;
  customerName?: string;
  petName?: string;
  now: Date;
}) {
  const { businessId, callerPhone, customerName, petName, now } = input;

  return prisma.appointment.findMany({
    where: {
      businessId,
      status: { not: "CANCELLED" },
      startTime: { gte: now },
      ...(callerPhone
        ? { customerPhone: callerPhone }
        : { customerName: { contains: customerName!, mode: "insensitive" } }),
      ...(petName ? { petName: { contains: petName, mode: "insensitive" } } : {}),
    },
    orderBy: { startTime: "asc" },
  });
}

async function preserveAppointmentState(
  appointmentId: string,
  status: AppointmentStatus,
  bookingMode: BookingMode
) {
  const updateData: Prisma.AppointmentUpdateInput = {
    status,
    bookingMode,
  };

  if (status === "CONFIRMED") {
    updateData.confirmLink = null;
  }

  if (status === "PENDING") {
    updateData.confirmLink = buildConfirmLink(appointmentId);
  }

  return prisma.appointment.update({
    where: { id: appointmentId },
    data: updateData,
  });
}

async function deleteExternalEvent(appointment: {
  businessId: string;
  calendarEventId: string | null;
}) {
  if (!appointment.calendarEventId) {
    return;
  }

  const primaryCalendar = await prisma.calendarConnection.findFirst({
    where: {
      businessId: appointment.businessId,
      isPrimary: true,
      isActive: true,
    },
  });

  if (!primaryCalendar) {
    return;
  }

  try {
    if (primaryCalendar.provider === "GOOGLE") {
      await deleteGoogleCalendarEvent(primaryCalendar, appointment.calendarEventId);
      return;
    }

    if (primaryCalendar.provider === "SQUARE") {
      await deleteSquareBooking(primaryCalendar, appointment.calendarEventId);
      return;
    }

    if (primaryCalendar.provider === "ACUITY") {
      await cancelAcuityAppointment(primaryCalendar, appointment.calendarEventId);
    }
  } catch (error) {
    console.error("[reschedule-appointment] External calendar cleanup failed:", error);
  }
}
