import { google } from "googleapis";
import { prisma } from "./prisma";
import type {
  AppointmentStatus,
  BookingMode,
  CalendarConnection,
  PetSize,
} from "@prisma/client";

type BusinessHoursMap = Record<string, { open: string; close: string }>;
type DateParts = { year: number; month: number; day: number };

// --- Google Calendar ---

function getGoogleAuth(connection: CalendarConnection) {
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/connect`
  );
  oauth2Client.setCredentials({
    access_token: connection.accessToken,
    refresh_token: connection.refreshToken,
    expiry_date: connection.tokenExpiry?.getTime(),
  });

  // Auto-refresh tokens
  oauth2Client.on("tokens", async (tokens) => {
    await prisma.calendarConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: tokens.access_token || connection.accessToken,
        refreshToken: tokens.refresh_token || connection.refreshToken,
        tokenExpiry: tokens.expiry_date
          ? new Date(tokens.expiry_date)
          : connection.tokenExpiry,
      },
    });
  });

  return oauth2Client;
}

export async function getGoogleCalendarEvents(
  connection: CalendarConnection,
  timeMin: Date,
  timeMax: Date
) {
  const auth = getGoogleAuth(connection);
  const calendar = google.calendar({ version: "v3", auth });

  const response = await calendar.events.list({
    calendarId: connection.calendarId || "primary",
    timeMin: timeMin.toISOString(),
    timeMax: timeMax.toISOString(),
    singleEvents: true,
    orderBy: "startTime",
  });

  return (response.data.items || []).map((event) => ({
    id: event.id,
    summary: event.summary,
    start: event.start?.dateTime || event.start?.date,
    end: event.end?.dateTime || event.end?.date,
    status: event.status,
  }));
}

export async function createGoogleCalendarEvent(
  connection: CalendarConnection,
  event: {
    summary: string;
    description?: string;
    startTime: Date;
    endTime: Date;
    attendeeEmail?: string;
  }
) {
  const auth = getGoogleAuth(connection);
  const calendar = google.calendar({ version: "v3", auth });

  const response = await calendar.events.insert({
    calendarId: connection.calendarId || "primary",
    requestBody: {
      summary: event.summary,
      description: event.description,
      start: { dateTime: event.startTime.toISOString() },
      end: { dateTime: event.endTime.toISOString() },
      attendees: event.attendeeEmail
        ? [{ email: event.attendeeEmail }]
        : undefined,
      reminders: {
        useDefault: false,
        overrides: [{ method: "popup", minutes: 30 }],
      },
    },
  });

  return response.data;
}

export async function deleteGoogleCalendarEvent(
  connection: CalendarConnection,
  eventId: string
) {
  const auth = getGoogleAuth(connection);
  const calendar = google.calendar({ version: "v3", auth });
  await calendar.events.delete({
    calendarId: connection.calendarId || "primary",
    eventId,
  });
}

// --- Calendly ---

export async function getCalendlyAvailability(
  connection: CalendarConnection,
  startTime: Date,
  endTime: Date
) {
  if (!connection.accessToken) throw new Error("Calendly not connected");

  const response = await fetch(
    `https://api.calendly.com/user_availability_schedules`,
    {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) throw new Error("Failed to fetch Calendly availability");
  return response.json();
}

export async function createCalendlyBooking(
  connection: CalendarConnection,
  details: {
    eventTypeUri: string;
    startTime: Date;
    inviteeName: string;
    inviteeEmail?: string;
  }
) {
  const response = await fetch(`https://api.calendly.com/scheduled_events`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${connection.accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      event_type: details.eventTypeUri,
      start_time: details.startTime.toISOString(),
      invitees: [
        {
          name: details.inviteeName,
          email: details.inviteeEmail,
        },
      ],
    }),
  });

  if (!response.ok) throw new Error("Failed to create Calendly booking");
  return response.json();
}

// --- Cal.com ---

export async function getCalcomAvailability(
  connection: CalendarConnection,
  startTime: Date,
  endTime: Date
) {
  const apiKey = connection.accessToken || process.env.CALCOM_API_KEY;
  if (!apiKey) throw new Error("Cal.com not configured");

  const params = new URLSearchParams({
    dateFrom: startTime.toISOString(),
    dateTo: endTime.toISOString(),
  });

  const response = await fetch(
    `https://api.cal.com/v1/availability?${params}&apiKey=${apiKey}`
  );

  if (!response.ok) throw new Error("Failed to fetch Cal.com availability");
  return response.json();
}

export async function createCalcomBooking(
  connection: CalendarConnection,
  details: {
    eventTypeId: number;
    startTime: Date;
    name: string;
    email?: string;
  }
) {
  const apiKey = connection.accessToken || process.env.CALCOM_API_KEY;

  const response = await fetch(
    `https://api.cal.com/v1/bookings?apiKey=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        eventTypeId: details.eventTypeId,
        start: details.startTime.toISOString(),
        responses: {
          name: details.name,
          email: details.email || "noreply@ringpaw.ai",
        },
      }),
    }
  );

  if (!response.ok) throw new Error("Failed to create Cal.com booking");
  return response.json();
}

// --- Unified Calendar Interface ---

export interface TimeSlot {
  start: Date;
  end: Date;
}

function getBusinessTimezone(timezone?: string | null) {
  return timezone || "America/Los_Angeles";
}

function getTimeZoneOffsetMs(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });

  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second)
  );

  return asUtc - date.getTime();
}

function zonedDateTimeToUtc(
  dateParts: DateParts,
  hour: number,
  minute: number,
  timeZone: string
) {
  const utcGuess = Date.UTC(
    dateParts.year,
    dateParts.month - 1,
    dateParts.day,
    hour,
    minute,
    0
  );
  const initialOffset = getTimeZoneOffsetMs(new Date(utcGuess), timeZone);
  let adjusted = utcGuess - initialOffset;
  const correctedOffset = getTimeZoneOffsetMs(new Date(adjusted), timeZone);

  if (correctedOffset !== initialOffset) {
    adjusted = utcGuess - correctedOffset;
  }

  return new Date(adjusted);
}

function getDatePartsInTimeZone(date: Date, timeZone: string): DateParts {
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = Object.fromEntries(
    formatter
      .formatToParts(date)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, part.value])
  );

  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

function getRequestedDateParts(dateInput: Date | string, timeZone: string): DateParts {
  if (typeof dateInput === "string") {
    const match = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    if (match) {
      return {
        year: Number(match[1]),
        month: Number(match[2]),
        day: Number(match[3]),
      };
    }
  }

  const parsedDate = dateInput instanceof Date ? dateInput : new Date(dateInput);
  return getDatePartsInTimeZone(parsedDate, timeZone);
}

function parseBusinessTime(value: string) {
  const [hourString, minuteString = "0"] = value.split(":");
  return {
    hour: Number(hourString),
    minute: Number(minuteString),
  };
}

function getHoursForDay(
  hours: BusinessHoursMap,
  dayKey: string
): { open: string; close: string } | undefined {
  if (hours[dayKey]) {
    return hours[dayKey];
  }

  if (
    ["mon", "tue", "wed", "thu", "fri"].includes(dayKey) &&
    hours["mon-fri"]
  ) {
    return hours["mon-fri"];
  }

  return undefined;
}

function formatTimeInTimeZone(date: Date, timeZone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "numeric",
    minute: "2-digit",
  }).format(date);
}

async function getBusyIntervals(
  businessId: string,
  dayStart: Date,
  dayEnd: Date
): Promise<TimeSlot[]> {
  const [connections, existingAppointments] = await Promise.all([
    prisma.calendarConnection.findMany({
      where: { businessId, isActive: true },
    }),
    prisma.appointment.findMany({
      where: {
        businessId,
        status: { in: ["CONFIRMED", "PENDING"] },
        startTime: { lt: dayEnd },
        endTime: { gt: dayStart },
      },
      select: { startTime: true, endTime: true },
    }),
  ]);

  const busyTimes: TimeSlot[] = existingAppointments.map((appointment) => ({
    start: appointment.startTime,
    end: appointment.endTime,
  }));

  for (const conn of connections) {
    try {
      if (conn.provider === "GOOGLE") {
        const events = await getGoogleCalendarEvents(conn, dayStart, dayEnd);
        for (const event of events) {
          if (event.start && event.end && event.status !== "cancelled") {
            busyTimes.push({
              start: new Date(event.start),
              end: new Date(event.end),
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching calendar ${conn.provider}:`, error);
    }
  }

  return busyTimes;
}

export async function isSlotAvailable(
  businessId: string,
  startTime: Date,
  endTime: Date
) {
  const busyIntervals = await getBusyIntervals(businessId, startTime, endTime);
  return !busyIntervals.some(
    (busy) => startTime < busy.end && endTime > busy.start
  );
}

export async function getAvailableSlots(
  businessId: string,
  date: Date | string,
  durationMinutes: number = 60
): Promise<TimeSlot[]> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
  });

  if (!business) throw new Error("Business not found");
  const timezone = getBusinessTimezone(business.timezone);
  const dateParts = getRequestedDateParts(date, timezone);
  const dayStart = zonedDateTimeToUtc(dateParts, 0, 0, timezone);
  const dayEnd = zonedDateTimeToUtc(dateParts, 23, 59, timezone);
  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const dayIndex = new Date(dayStart).getUTCDay();
  const dayKey = dayNames[dayIndex];
  const hours = business.businessHours as BusinessHoursMap | null;

  let openTime = { hour: 9, minute: 0 };
  let closeTime = { hour: 17, minute: 0 };

  if (hours) {
    const dayHours = getHoursForDay(hours, dayKey);
    if (!dayHours?.open || !dayHours?.close) {
      return [];
    }
    openTime = parseBusinessTime(dayHours.open);
    closeTime = parseBusinessTime(dayHours.close);
  }

  const slotStart = zonedDateTimeToUtc(
    dateParts,
    openTime.hour,
    openTime.minute,
    timezone
  );
  const slotEnd = zonedDateTimeToUtc(
    dateParts,
    closeTime.hour,
    closeTime.minute,
    timezone
  );
  const busyTimes = await getBusyIntervals(businessId, dayStart, dayEnd);
  const slots: TimeSlot[] = [];

  let current = new Date(slotStart);
  while (current.getTime() + durationMinutes * 60000 <= slotEnd.getTime()) {
    const candidateEnd = new Date(
      current.getTime() + durationMinutes * 60000
    );

    // Check if this slot conflicts with any busy time
    const hasConflict = busyTimes.some(
      (busy) => current < busy.end && candidateEnd > busy.start
    );

    if (!hasConflict) {
      slots.push({ start: new Date(current), end: new Date(candidateEnd) });
    }

    // Move to next 30-minute interval
    current = new Date(current.getTime() + 30 * 60000);
  }

  return slots;
}

export async function bookAppointment(
  businessId: string,
  details: {
    customerName: string;
    customerPhone?: string;
    petName?: string;
    petBreed?: string;
    petSize?: PetSize;
    serviceName?: string;
    servicePrice?: number;
    startTime: Date;
    endTime: Date;
    notes?: string;
  }
) {
  if (
    !(details.startTime instanceof Date) ||
    Number.isNaN(details.startTime.getTime()) ||
    !(details.endTime instanceof Date) ||
    Number.isNaN(details.endTime.getTime()) ||
    details.endTime <= details.startTime
  ) {
    throw new Error("Invalid appointment time range");
  }

  const [business, primaryCalendar, matchedService] = await Promise.all([
    prisma.business.findUnique({
      where: { id: businessId },
    }),
    prisma.calendarConnection.findFirst({
      where: { businessId, isPrimary: true, isActive: true },
    }),
    details.serviceName
      ? prisma.service.findFirst({
          where: {
            businessId,
            isActive: true,
            name: {
              contains: details.serviceName,
              mode: "insensitive",
            },
          },
        })
      : Promise.resolve(null),
  ]);

  if (!business) {
    throw new Error("Business not found");
  }

  const isAvailable = await isSlotAvailable(
    businessId,
    details.startTime,
    details.endTime
  );

  if (!isAvailable) {
    throw new Error("Requested slot is no longer available");
  }

  const bookingMode: BookingMode =
    matchedService?.bookingMode || business.bookingMode;

  const appointment = await prisma.$transaction(async (tx) => {
    const conflictingAppointment = await tx.appointment.findFirst({
      where: {
        businessId,
        status: { in: ["CONFIRMED", "PENDING"] as AppointmentStatus[] },
        startTime: { lt: details.endTime },
        endTime: { gt: details.startTime },
      },
      select: { id: true },
    });

    if (conflictingAppointment) {
      throw new Error("Requested slot was booked by another caller");
    }

    return tx.appointment.create({
      data: {
        businessId,
        customerName: details.customerName,
        customerPhone: details.customerPhone,
        petName: details.petName,
        petBreed: details.petBreed,
        petSize: details.petSize,
        serviceName: matchedService?.name || details.serviceName,
        servicePrice: matchedService?.price || details.servicePrice,
        startTime: details.startTime,
        endTime: details.endTime,
        status: bookingMode === "HARD" ? "CONFIRMED" : "PENDING",
        bookingMode,
        notes: details.notes,
      },
    });
  });

  if (primaryCalendar?.provider === "GOOGLE") {
    try {
      const event = await createGoogleCalendarEvent(primaryCalendar, {
        summary: `${details.petName || "Pet"} - ${matchedService?.name || details.serviceName || "Grooming"} (${details.customerName})`,
        description: [
          `Customer: ${details.customerName}`,
          details.customerPhone ? `Phone: ${details.customerPhone}` : "",
          details.petName ? `Pet: ${details.petName}` : "",
          details.petBreed ? `Breed: ${details.petBreed}` : "",
          details.petSize ? `Size: ${details.petSize}` : "",
          details.notes ? `Notes: ${details.notes}` : "",
          "",
          "Booked via RingPaw AI",
        ]
          .filter(Boolean)
          .join("\n"),
        startTime: details.startTime,
        endTime: details.endTime,
      });

      return prisma.appointment.update({
        where: { id: appointment.id },
        data: {
          calendarEventId: event.id || undefined,
        },
      });
    } catch (error) {
      console.error("Error creating Google Calendar event:", error);
    }
  }

  return appointment;
}

export function describeAvailableSlots(
  slots: TimeSlot[],
  timeZone: string,
  maxSlots: number = 3
) {
  return slots
    .slice(0, maxSlots)
    .map((slot) => formatTimeInTimeZone(slot.start, timeZone))
    .join(", or ");
}
