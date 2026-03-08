import { prisma } from "./prisma";
import { sendSms } from "./sms";
import { formatDateTime } from "./utils";
import { normalizePhoneNumber } from "./phone";
import type { Appointment, Business, PhoneNumber } from "@prisma/client";

type BusinessWithPhone = Business & { phoneNumber: PhoneNumber | null };

export async function sendBookingNotificationToOwner(
  business: BusinessWithPhone,
  appointment: Appointment
) {
  const ownerPhone = normalizePhoneNumber(business.phone);
  if (!ownerPhone) {
    console.warn("[SMS] Skipping owner notification: business.phone is not set for business", business.id);
    return;
  }
  if (!business.phoneNumber) {
    console.warn("[SMS] Skipping owner notification: no provisioned phone number for business", business.id);
    return;
  }

  const fromNumber = process.env.TWILIO_PHONE_NUMBER || business.phoneNumber.number;
  const time = formatDateTime(appointment.startTime, business.timezone);

  const message = [
    `[RingPaw] New booking!`,
    `${appointment.petName || "Pet"} (${appointment.petBreed || "Unknown breed"}, ${appointment.petSize || "?"})`,
    `${appointment.serviceName || "Grooming"} - ${time}`,
    `Customer: ${appointment.customerName} (${appointment.customerPhone || "no phone"})`,
    appointment.calendarEventId ? `Added to calendar.` : "",
    appointment.status === "PENDING"
      ? "Soft-booked (2hr hold)"
      : "Confirmed",
  ]
    .filter(Boolean)
    .join("\n");

  await sendSms(ownerPhone, message, fromNumber);
}

export async function sendBookingConfirmationToCustomer(
  business: BusinessWithPhone,
  appointment: Appointment
) {
  const customerPhone = normalizePhoneNumber(appointment.customerPhone);
  if (!customerPhone) {
    console.warn("[SMS] Skipping customer confirmation: no customerPhone on appointment", appointment.id);
    return;
  }
  if (!business.phoneNumber) {
    console.warn("[SMS] Skipping customer confirmation: no provisioned phone number for business", business.id);
    return;
  }

  const fromNumber = process.env.TWILIO_PHONE_NUMBER || business.phoneNumber.number;
  const time = formatDateTime(appointment.startTime, business.timezone);

  const message = [
    `Hi ${appointment.customerName}! Your appointment at ${business.name} is ${appointment.status === "CONFIRMED" ? "confirmed" : "tentatively booked"}.`,
    "",
    `${appointment.petName || "Your pet"} - ${appointment.serviceName || "Grooming"}`,
    time,
    business.address ? business.address : "",
    "",
    appointment.status === "PENDING" && appointment.confirmLink
      ? `Please confirm: ${appointment.confirmLink}`
      : "",
    "Reply CANCEL to cancel. See you soon!",
  ]
    .filter(Boolean)
    .join("\n");

  await sendSms(customerPhone, message, fromNumber);
}

export async function sendMissedCallNotification(
  business: BusinessWithPhone,
  callerPhone: string,
  callerName?: string
) {
  if (!business.phoneNumber) {
    console.warn("[SMS] Skipping missed call notification: no provisioned phone number for business", business.id);
    return;
  }

  const fromNumber = process.env.TWILIO_PHONE_NUMBER || business.phoneNumber.number;
  const ownerPhone = normalizePhoneNumber(business.phone);
  const callerE164 = normalizePhoneNumber(callerPhone);

  // Notify owner
  if (ownerPhone) {
    const ownerMessage = [
      `[RingPaw] Missed call - no booking made.`,
      `Caller: ${callerName || "Unknown"} (${callerPhone})`,
      `They may call back or you can reach out.`,
    ].join("\n");
    await sendSms(ownerPhone, ownerMessage, fromNumber);
  }

  // Auto-reply to caller
  if (callerE164) {
    const callerMessage = [
      `Hi${callerName ? ` ${callerName}` : ""}! Sorry we missed your call to ${business.name}.`,
      `Reply BOOK to schedule an appointment, or call us back anytime. We'd love to help! 🐾`,
    ].join(" ");
    await sendSms(callerE164, callerMessage, fromNumber);
  }
}

export async function sendAppointmentReminder(
  business: BusinessWithPhone,
  appointment: Appointment
) {
  const customerPhone = normalizePhoneNumber(appointment.customerPhone);
  if (!customerPhone || !business.phoneNumber) return;

  const fromNumber = process.env.TWILIO_PHONE_NUMBER || business.phoneNumber.number;
  const time = formatDateTime(appointment.startTime, business.timezone);

  const message = [
    `Reminder: ${appointment.petName || "Your pet"}'s ${appointment.serviceName || "grooming"} appointment at ${business.name} is tomorrow!`,
    time,
    business.address || "",
    "Reply CANCEL to cancel. See you soon!",
  ]
    .filter(Boolean)
    .join("\n");

  await sendSms(customerPhone, message, fromNumber);

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { reminderSent: true },
  });
}

// --- No-Show Protection: 48h Reminder ---

export async function send48hReminder(
  business: BusinessWithPhone,
  appointment: Appointment
) {
  const customerPhone = normalizePhoneNumber(appointment.customerPhone);
  if (!customerPhone || !business.phoneNumber) return;

  const fromNumber = process.env.TWILIO_PHONE_NUMBER || business.phoneNumber.number;
  const time = formatDateTime(appointment.startTime, business.timezone);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  const message = [
    `Hi ${appointment.customerName}! Quick reminder — ${appointment.petName || "your pet"}'s ${appointment.serviceName || "grooming"} at ${business.name} is coming up:`,
    time,
    "",
    `Reply CONFIRM to keep your spot, or CANCEL if you need to reschedule.`,
    "",
    `We appreciate the heads up! 🐾`,
  ].join("\n");

  await sendSms(customerPhone, message, fromNumber);

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { reminder48hSent: true },
  });
}

// --- No-Show Protection: Waitlist fill notification ---

export async function sendWaitlistOpeningNotification(
  business: BusinessWithPhone,
  entry: { customerPhone: string; customerName: string; petName?: string | null; serviceName?: string | null },
  openingTime: string
) {
  const customerPhone = normalizePhoneNumber(entry.customerPhone);
  if (!customerPhone || !business.phoneNumber) return;

  const fromNumber = process.env.TWILIO_PHONE_NUMBER || business.phoneNumber.number;

  const message = [
    `Great news, ${entry.customerName}! A spot just opened up at ${business.name}:`,
    openingTime,
    entry.petName ? `For ${entry.petName}` : "",
    "",
    `Reply BOOK to grab this slot, or we'll offer it to the next person on the list.`,
  ]
    .filter(Boolean)
    .join("\n");

  await sendSms(customerPhone, message, fromNumber);
}

// --- No-Show Protection: No-response follow-up call ---

export async function sendNoResponseFollowUp(
  business: BusinessWithPhone,
  appointment: Appointment
) {
  const customerPhone = normalizePhoneNumber(appointment.customerPhone);
  if (!customerPhone || !business.phoneNumber) return;

  const fromNumber = process.env.TWILIO_PHONE_NUMBER || business.phoneNumber.number;
  const time = formatDateTime(appointment.startTime, business.timezone);

  const message = [
    `Hi ${appointment.customerName}, we haven't heard back about ${appointment.petName || "your pet"}'s appointment at ${business.name}:`,
    time,
    "",
    `Please reply CONFIRM or CANCEL so we can plan accordingly. If we don't hear back, we may need to release the slot. Thank you!`,
  ].join("\n");

  await sendSms(customerPhone, message, fromNumber);
}

// --- 30-Minute "On My Way" Reminder ---

export async function sendOnMyWayReminder(
  business: BusinessWithPhone,
  appointment: Appointment
) {
  const customerPhone = normalizePhoneNumber(appointment.customerPhone);
  if (!customerPhone || !business.phoneNumber) return;

  const fromNumber = process.env.TWILIO_PHONE_NUMBER || business.phoneNumber.number;
  const time = formatDateTime(appointment.startTime, business.timezone);

  const message = `Heads up! ${appointment.petName || "Your pet"}'s appointment at ${business.name} is in 30 minutes (${time}). See you soon! 🐾`;

  await sendSms(customerPhone, message, fromNumber);

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { onMyWaySent: true },
  });
}

// --- No-Show: Notify owner of cancellation + waitlist fill ---

export async function sendCancellationWithWaitlistNotification(
  business: BusinessWithPhone,
  cancelledAppt: Appointment,
  waitlistCustomerName?: string
) {
  const ownerPhone = normalizePhoneNumber(business.phone);
  if (!ownerPhone || !business.phoneNumber) return;

  const fromNumber = process.env.TWILIO_PHONE_NUMBER || business.phoneNumber.number;
  const time = formatDateTime(cancelledAppt.startTime, business.timezone);

  const message = waitlistCustomerName
    ? [
        `[RingPaw] ${cancelledAppt.customerName} cancelled their ${time} slot.`,
        `Waitlist auto-fill: contacting ${waitlistCustomerName} to fill the opening.`,
      ].join("\n")
    : [
        `[RingPaw] ${cancelledAppt.customerName} cancelled their ${time} slot.`,
        `No one on the waitlist for this time.`,
      ].join("\n");

  await sendSms(ownerPhone, message, fromNumber);
}
