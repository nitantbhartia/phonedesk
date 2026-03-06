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

  return (response.data.items || [])
    .filter((event) => event.start?.dateTime && event.end?.dateTime)
    .map((event) => ({
      id: event.id,
      summary: event.summary,
      start: event.start!.dateTime!,
      end: event.end!.dateTime!,
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

// --- Square Appointments ---

export async function getSquareBookings(
  connection: CalendarConnection,
  startTime: Date,
  endTime: Date
) {
  if (!connection.accessToken) throw new Error("Square not connected");

  const locationId = (connection.metadata as { locationId?: string })?.locationId;
  if (!locationId) throw new Error("Square location not configured");

  // Search bookings in the given date range
  const response = await fetch(
    `https://connect.squareup.com/v2/bookings?location_id=${locationId}&start_at_min=${startTime.toISOString()}&start_at_max=${endTime.toISOString()}`,
    {
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json",
        "Square-Version": "2024-10-17",
      },
    }
  );

  if (!response.ok) throw new Error("Failed to fetch Square bookings");
  const data = await response.json();
  return (data.bookings || []).map((b: { id: string; start_at: string; appointment_segments?: { duration_minutes: number }[]; status: string }) => ({
    id: b.id,
    start: b.start_at,
    end: new Date(
      new Date(b.start_at).getTime() +
        (b.appointment_segments?.[0]?.duration_minutes || 60) * 60000
    ).toISOString(),
    status: b.status,
  }));
}

export async function createSquareBooking(
  connection: CalendarConnection,
  details: {
    startTime: Date;
    customerName: string;
    customerPhone?: string;
    serviceName?: string;
    durationMinutes?: number;
  }
) {
  if (!connection.accessToken) throw new Error("Square not connected");

  const locationId = (connection.metadata as { locationId?: string })?.locationId;
  if (!locationId) throw new Error("Square location not configured");

  const response = await fetch(
    "https://connect.squareup.com/v2/bookings",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json",
        "Square-Version": "2024-10-17",
      },
      body: JSON.stringify({
        idempotency_key: `ringpaw-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        booking: {
          location_id: locationId,
          start_at: details.startTime.toISOString(),
          appointment_segments: [
            {
              duration_minutes: details.durationMinutes || 60,
              service_variation_id: "any", // Let Square pick default service
            },
          ],
          customer_note: `${details.customerName}${details.serviceName ? ` - ${details.serviceName}` : ""} (Booked via RingPaw AI)`,
        },
      }),
    }
  );

  if (!response.ok) throw new Error("Failed to create Square booking");
  return response.json();
}

export async function deleteSquareBooking(
  connection: CalendarConnection,
  bookingId: string
) {
  if (!connection.accessToken) throw new Error("Square not connected");

  const response = await fetch(
    `https://connect.squareup.com/v2/bookings/${bookingId}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${connection.accessToken}`,
        "Content-Type": "application/json",
        "Square-Version": "2024-10-17",
      },
      body: JSON.stringify({}),
    }
  );

  if (!response.ok) throw new Error("Failed to cancel Square booking");
  return response.json();
}

// --- Acuity Scheduling ---

function getAcuityAuthHeader(connection: CalendarConnection) {
  // Acuity uses userId:apiKey basic auth or OAuth bearer token
  const meta = connection.metadata as { userId?: string } | null;
  if (meta?.userId && connection.accessToken) {
    return `Basic ${Buffer.from(`${meta.userId}:${connection.accessToken}`).toString("base64")}`;
  }
  if (connection.accessToken) {
    return `Bearer ${connection.accessToken}`;
  }
  throw new Error("Acuity not connected");
}

export async function getAcuityAppointments(
  connection: CalendarConnection,
  startTime: Date,
  endTime: Date
) {
  const authHeader = getAcuityAuthHeader(connection);

  const params = new URLSearchParams({
    minDate: startTime.toISOString(),
    maxDate: endTime.toISOString(),
  });

  const response = await fetch(
    `https://acuityscheduling.com/api/v1/appointments?${params}`,
    {
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) throw new Error("Failed to fetch Acuity appointments");
  const data = await response.json();
  return (data as { id: number; datetime: string; endTime: string; canceled: boolean }[]).map((a) => ({
    id: String(a.id),
    start: a.datetime,
    end: a.endTime,
    status: a.canceled ? "cancelled" : "confirmed",
  }));
}

export async function createAcuityAppointment(
  connection: CalendarConnection,
  details: {
    startTime: Date;
    appointmentTypeId: number;
    customerName: string;
    customerEmail?: string;
    customerPhone?: string;
  }
) {
  const authHeader = getAcuityAuthHeader(connection);

  const [firstName, ...lastParts] = details.customerName.split(" ");
  const lastName = lastParts.join(" ") || firstName;

  const response = await fetch(
    "https://acuityscheduling.com/api/v1/appointments",
    {
      method: "POST",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        datetime: details.startTime.toISOString(),
        appointmentTypeID: details.appointmentTypeId,
        firstName,
        lastName,
        email: details.customerEmail || "",
        phone: details.customerPhone || "",
        notes: "Booked via RingPaw AI",
      }),
    }
  );

  if (!response.ok) throw new Error("Failed to create Acuity appointment");
  return response.json();
}

export async function cancelAcuityAppointment(
  connection: CalendarConnection,
  appointmentId: string
) {
  const authHeader = getAcuityAuthHeader(connection);

  const response = await fetch(
    `https://acuityscheduling.com/api/v1/appointments/${appointmentId}/cancel`,
    {
      method: "PUT",
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
    }
  );

  if (!response.ok) throw new Error("Failed to cancel Acuity appointment");
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
  // Handle both 24-hour ("09:00") and 12-hour ("9:00 AM") formats
  const trimmed = value.trim();
  const is12Hour = /AM|PM/i.test(trimmed);

  if (is12Hour) {
    const [timePart, meridiem] = trimmed.split(/\s+/);
    const [rawHour, rawMinute = "0"] = timePart.split(":");
    let hour = Number(rawHour);
    const minute = Number(rawMinute);
    if (meridiem?.toUpperCase() === "PM" && hour !== 12) hour += 12;
    if (meridiem?.toUpperCase() === "AM" && hour === 12) hour = 0;
    return { hour, minute };
  }

  const [hourString, minuteString = "0"] = trimmed.split(":");
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

  // Support full day names saved by older versions of onboarding
  const fullDayNames: Record<string, string> = {
    sat: "saturday",
    sun: "sunday",
    mon: "monday",
    tue: "tuesday",
    wed: "wednesday",
    thu: "thursday",
    fri: "friday",
  };
  if (fullDayNames[dayKey] && hours[fullDayNames[dayKey]]) {
    return hours[fullDayNames[dayKey]];
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
      } else if (conn.provider === "SQUARE") {
        const bookings = await getSquareBookings(conn, dayStart, dayEnd);
        for (const b of bookings) {
          if (b.status !== "CANCELLED" && b.status !== "DECLINED") {
            busyTimes.push({
              start: new Date(b.start),
              end: new Date(b.end),
            });
          }
        }
      } else if (conn.provider === "ACUITY") {
        const appointments = await getAcuityAppointments(conn, dayStart, dayEnd);
        for (const a of appointments) {
          if (a.status !== "cancelled") {
            busyTimes.push({
              start: new Date(a.start),
              end: new Date(a.end),
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

export interface ConflictEntry {
  start: Date;
  end: Date;
  summary: string;
  source: string; // "Google Calendar", "Square", "Acuity", "RingPaw"
}

export async function getConflicts(
  businessId: string,
  dayStart: Date,
  dayEnd: Date
): Promise<ConflictEntry[]> {
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
      select: { startTime: true, endTime: true, customerName: true, serviceName: true },
    }),
  ]);

  const conflicts: ConflictEntry[] = existingAppointments.map((a) => ({
    start: a.startTime,
    end: a.endTime,
    summary: [a.customerName, a.serviceName].filter(Boolean).join(" — ") || "Appointment",
    source: "RingPaw",
  }));

  for (const conn of connections) {
    try {
      if (conn.provider === "GOOGLE") {
        const events = await getGoogleCalendarEvents(conn, dayStart, dayEnd);
        for (const event of events) {
          if (event.start && event.end && event.status !== "cancelled") {
            conflicts.push({
              start: new Date(event.start),
              end: new Date(event.end),
              summary: event.summary || "Busy",
              source: "Google Calendar",
            });
          }
        }
      } else if (conn.provider === "SQUARE") {
        const bookings = await getSquareBookings(conn, dayStart, dayEnd);
        for (const b of bookings) {
          if (b.status !== "CANCELLED" && b.status !== "DECLINED") {
            conflicts.push({
              start: new Date(b.start),
              end: new Date(b.end),
              summary: "Square Booking",
              source: "Square",
            });
          }
        }
      } else if (conn.provider === "ACUITY") {
        const appointments = await getAcuityAppointments(conn, dayStart, dayEnd);
        for (const a of appointments) {
          if (a.status !== "cancelled") {
            conflicts.push({
              start: new Date(a.start),
              end: new Date(a.end),
              summary: "Acuity Appointment",
              source: "Acuity",
            });
          }
        }
      }
    } catch (error) {
      console.error(`Error fetching calendar ${conn.provider}:`, error);
    }
  }

  conflicts.sort((a, b) => a.start.getTime() - b.start.getTime());
  return conflicts;
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

  console.log("[getAvailableSlots] date:", date, "dayKey:", dayKey, "businessHours:", JSON.stringify(hours), "timezone:", timezone);

  let openTime = { hour: 9, minute: 0 };
  let closeTime = { hour: 17, minute: 0 };

  if (hours && Object.keys(hours).length > 0) {
    const dayHours = getHoursForDay(hours, dayKey);
    if (!dayHours?.open || !dayHours?.close) {
      console.log("[getAvailableSlots] No hours found for", dayKey, "— business is closed. Available keys:", Object.keys(hours));
      return [];
    }
    openTime = parseBusinessTime(dayHours.open);
    closeTime = parseBusinessTime(dayHours.close);
    // Guard against non-numeric values like "closed" that pass truthiness checks
    if (
      isNaN(openTime.hour) || isNaN(openTime.minute) ||
      isNaN(closeTime.hour) || isNaN(closeTime.minute)
    ) {
      return [];
    }
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
  const now = new Date();

  console.log("[getAvailableSlots] openTime:", openTime, "closeTime:", closeTime, "slotStart:", slotStart.toISOString(), "slotEnd:", slotEnd.toISOString(), "now:", now.toISOString(), "busyIntervals:", busyTimes.length);

  let current = new Date(slotStart);
  while (current.getTime() + durationMinutes * 60000 <= slotEnd.getTime()) {
    const candidateEnd = new Date(
      current.getTime() + durationMinutes * 60000
    );

    // Skip slots that are in the past
    if (current <= now) {
      current = new Date(current.getTime() + 30 * 60000);
      continue;
    }

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

  if (primaryCalendar) {
    const eventSummary = `${details.petName || "Pet"} - ${matchedService?.name || details.serviceName || "Grooming"} (${details.customerName})`;
    const eventDescription = [
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
      .join("\n");

    try {
      let externalEventId: string | undefined;

      if (primaryCalendar.provider === "GOOGLE") {
        const event = await createGoogleCalendarEvent(primaryCalendar, {
          summary: eventSummary,
          description: eventDescription,
          startTime: details.startTime,
          endTime: details.endTime,
        });
        externalEventId = event.id || undefined;
      } else if (primaryCalendar.provider === "SQUARE") {
        const durationMs = details.endTime.getTime() - details.startTime.getTime();
        const booking = await createSquareBooking(primaryCalendar, {
          startTime: details.startTime,
          customerName: details.customerName,
          customerPhone: details.customerPhone,
          serviceName: matchedService?.name || details.serviceName,
          durationMinutes: Math.round(durationMs / 60000),
        });
        externalEventId = booking.booking?.id;
      } else if (primaryCalendar.provider === "ACUITY") {
        // Use first appointment type from metadata, or default
        const meta = primaryCalendar.metadata as { appointmentTypeId?: number } | null;
        const appt = await createAcuityAppointment(primaryCalendar, {
          startTime: details.startTime,
          appointmentTypeId: meta?.appointmentTypeId || 0,
          customerName: details.customerName,
          customerEmail: undefined,
          customerPhone: details.customerPhone,
        });
        externalEventId = String(appt.id);
      }

      if (externalEventId) {
        return prisma.appointment.update({
          where: { id: appointment.id },
          data: { calendarEventId: externalEventId },
        });
      }
    } catch (error) {
      console.error(`Error creating ${primaryCalendar.provider} event:`, error);
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
