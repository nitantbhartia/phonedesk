import { prisma } from "./prisma";
import { sendSms } from "./twilio";
import { formatDateTime } from "./utils";
import type { Appointment, Business, Call, TwilioNumber } from "@prisma/client";

export async function sendBookingNotificationToOwner(
  business: Business & { twilioNumber: TwilioNumber | null },
  appointment: Appointment,
  call?: Call | null
) {
  if (!business.phone || !business.twilioNumber) return;

  const fromNumber = business.twilioNumber.phoneNumber;
  const time = formatDateTime(appointment.startTime);

  const message = [
    `[RingPaw] New booking!`,
    `${appointment.petName || "Pet"} (${appointment.petBreed || "Unknown breed"}, ${appointment.petSize || "?"})`,
    `${appointment.serviceName || "Grooming"} - ${time}`,
    `Customer: ${appointment.customerName} (${appointment.customerPhone || "no phone"})`,
    appointment.calendarEventId ? `Added to calendar.` : "",
    appointment.status === "PENDING"
      ? "⏳ Soft-booked (2hr hold)"
      : "✅ Confirmed",
  ]
    .filter(Boolean)
    .join("\n");

  await sendSms(business.phone, message, fromNumber);
}

export async function sendBookingConfirmationToCustomer(
  business: Business & { twilioNumber: TwilioNumber | null },
  appointment: Appointment
) {
  if (!appointment.customerPhone || !business.twilioNumber) return;

  const fromNumber = business.twilioNumber.phoneNumber;
  const time = formatDateTime(appointment.startTime);

  const message = [
    `Hi ${appointment.customerName}! Your appointment at ${business.name} is ${appointment.status === "CONFIRMED" ? "confirmed" : "tentatively booked"}.`,
    "",
    `🐾 ${appointment.petName || "Your pet"} - ${appointment.serviceName || "Grooming"}`,
    `📅 ${time}`,
    business.address ? `📍 ${business.address}` : "",
    "",
    appointment.status === "PENDING" && appointment.confirmLink
      ? `Please confirm: ${appointment.confirmLink}`
      : "",
    "Reply CANCEL to cancel. See you soon!",
  ]
    .filter(Boolean)
    .join("\n");

  await sendSms(appointment.customerPhone, message, fromNumber);
}

export async function sendMissedCallNotification(
  business: Business & { twilioNumber: TwilioNumber | null },
  callerPhone: string,
  callerName?: string
) {
  if (!business.phone || !business.twilioNumber) return;

  const fromNumber = business.twilioNumber.phoneNumber;

  const message = [
    `[RingPaw] Missed call - no booking made.`,
    `Caller: ${callerName || "Unknown"} (${callerPhone})`,
    `They may call back or you can reach out.`,
  ].join("\n");

  await sendSms(business.phone, message, fromNumber);
}

export async function sendAppointmentReminder(
  business: Business & { twilioNumber: TwilioNumber | null },
  appointment: Appointment
) {
  if (!appointment.customerPhone || !business.twilioNumber) return;

  const fromNumber = business.twilioNumber.phoneNumber;
  const time = formatDateTime(appointment.startTime);

  const message = [
    `Reminder: ${appointment.petName || "Your pet"}'s ${appointment.serviceName || "grooming"} appointment at ${business.name} is tomorrow!`,
    `📅 ${time}`,
    business.address ? `📍 ${business.address}` : "",
    "Reply CANCEL to cancel. See you soon!",
  ]
    .filter(Boolean)
    .join("\n");

  await sendSms(appointment.customerPhone, message, fromNumber);

  // Mark reminder as sent
  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { reminderSent: true },
  });
}
