import { google } from "googleapis";
import { prisma } from "./prisma";
import type { CalendarConnection, CalendarProvider } from "@prisma/client";

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

export async function getAvailableSlots(
  businessId: string,
  date: Date,
  durationMinutes: number = 60
): Promise<TimeSlot[]> {
  const connections = await prisma.calendarConnection.findMany({
    where: { businessId, isActive: true },
  });

  const business = await prisma.business.findUnique({
    where: { id: businessId },
  });

  if (!business) throw new Error("Business not found");

  const dayStart = new Date(date);
  dayStart.setHours(0, 0, 0, 0);
  const dayEnd = new Date(date);
  dayEnd.setHours(23, 59, 59, 999);

  // Collect all busy times from all connected calendars
  const busyTimes: TimeSlot[] = [];

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
      // Add Calendly and Cal.com busy time fetching as needed
    } catch (error) {
      console.error(
        `Error fetching calendar ${conn.provider}:`,
        error
      );
    }
  }

  // Parse business hours for this day
  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const dayKey = dayNames[date.getDay()];
  const hours = business.businessHours as Record<
    string,
    { open: string; close: string }
  > | null;

  let openTime = 9;
  let closeTime = 17;
  if (hours && hours[dayKey]) {
    openTime = parseInt(hours[dayKey].open.split(":")[0]);
    closeTime = parseInt(hours[dayKey].close.split(":")[0]);
  }

  // Generate available slots
  const slots: TimeSlot[] = [];
  const slotStart = new Date(date);
  slotStart.setHours(openTime, 0, 0, 0);
  const slotEnd = new Date(date);
  slotEnd.setHours(closeTime, 0, 0, 0);

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
    petSize?: "SMALL" | "MEDIUM" | "LARGE" | "XLARGE";
    serviceName?: string;
    servicePrice?: number;
    startTime: Date;
    endTime: Date;
    notes?: string;
  }
) {
  // Find primary calendar
  const primaryCalendar = await prisma.calendarConnection.findFirst({
    where: { businessId, isPrimary: true, isActive: true },
  });

  let calendarEventId: string | undefined;

  // Create event on primary calendar
  if (primaryCalendar?.provider === "GOOGLE") {
    const event = await createGoogleCalendarEvent(primaryCalendar, {
      summary: `🐾 ${details.petName || "Pet"} - ${details.serviceName || "Grooming"} (${details.customerName})`,
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
    calendarEventId = event.id || undefined;
  }

  // Get business booking mode
  const business = await prisma.business.findUnique({
    where: { id: businessId },
  });

  // Create appointment record
  const appointment = await prisma.appointment.create({
    data: {
      businessId,
      customerName: details.customerName,
      customerPhone: details.customerPhone,
      petName: details.petName,
      petBreed: details.petBreed,
      petSize: details.petSize,
      serviceName: details.serviceName,
      servicePrice: details.servicePrice,
      startTime: details.startTime,
      endTime: details.endTime,
      status: business?.bookingMode === "HARD" ? "CONFIRMED" : "PENDING",
      bookingMode: business?.bookingMode || "SOFT",
      calendarEventId,
      notes: details.notes,
    },
  });

  return appointment;
}
