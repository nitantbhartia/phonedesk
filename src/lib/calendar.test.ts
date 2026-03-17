import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockCalendarEventsList,
  mockCalendarEventsInsert,
  mockCalendarEventsDelete,
  mockOAuthSetCredentials,
  mockOAuthOn,
  mockOAuth2,
  mockGoogleCalendar,
} = vi.hoisted(() => ({
  mockCalendarEventsList: vi.fn(),
  mockCalendarEventsInsert: vi.fn(),
  mockCalendarEventsDelete: vi.fn(),
  mockOAuthSetCredentials: vi.fn(),
  mockOAuthOn: vi.fn(),
  mockOAuth2: vi.fn(),
  mockGoogleCalendar: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: mockOAuth2,
    },
    calendar: mockGoogleCalendar,
  },
}));

vi.mock("@/lib/appointment-token", () => ({
  buildConfirmLink: vi.fn((id: string) => `https://confirm.test/${id}`),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarConnection: {
      update: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
    },
    appointment: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
    service: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

import {
  bookAppointment,
  cancelAcuityAppointment,
  createGoogleCalendarEvent,
  createAcuityAppointment,
  createSquareBooking,
  deleteGoogleCalendarEvent,
  deleteSquareBooking,
  getAcuityAppointments,
  describeAvailableSlots,
  getAvailableSlots,
  getConflicts,
  getGoogleCalendarEvents,
  getSquareBookings,
  isSlotAvailable,
  parseLocalDatetime,
} from "./calendar";
import { prisma } from "@/lib/prisma";

describe("calendar helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
    global.fetch = vi.fn();
    mockOAuth2.mockImplementation(() => ({
      setCredentials: mockOAuthSetCredentials,
      on: mockOAuthOn,
    }));
    mockGoogleCalendar.mockImplementation(() => ({
      events: {
        list: mockCalendarEventsList,
        insert: mockCalendarEventsInsert,
        delete: mockCalendarEventsDelete,
      },
    }));
  });

  it("filters Google events to timed non-all-day entries", async () => {
    mockCalendarEventsList.mockResolvedValue({
      data: {
        items: [
          {
            id: "evt_1",
            summary: "Busy",
            start: { dateTime: "2026-03-12T17:00:00.000Z" },
            end: { dateTime: "2026-03-12T18:00:00.000Z" },
            status: "confirmed",
          },
          {
            id: "evt_2",
            start: { date: "2026-03-12" },
            end: { date: "2026-03-13" },
          },
        ],
      },
    });

    const events = await getGoogleCalendarEvents(
      {
        id: "conn_1",
        accessToken: "token",
        refreshToken: "refresh",
        tokenExpiry: new Date("2026-03-12T00:00:00.000Z"),
        calendarId: "primary",
      } as never,
      new Date("2026-03-12T00:00:00.000Z"),
      new Date("2026-03-13T00:00:00.000Z")
    );

    expect(events).toEqual([
      {
        id: "evt_1",
        summary: "Busy",
        start: "2026-03-12T17:00:00.000Z",
        end: "2026-03-12T18:00:00.000Z",
        status: "confirmed",
      },
    ]);
  });

  it("creates Google events with attendee reminders", async () => {
    mockCalendarEventsInsert.mockResolvedValue({ data: { id: "evt_99" } });

    const result = await createGoogleCalendarEvent(
      {
        id: "conn_1",
        accessToken: "token",
        refreshToken: "refresh",
        tokenExpiry: null,
        calendarId: null,
      } as never,
      {
        summary: "Pip booking",
        description: "Booked via RingPaw",
        startTime: new Date("2026-03-12T17:00:00.000Z"),
        endTime: new Date("2026-03-12T18:00:00.000Z"),
        attendeeEmail: "jamie@example.com",
      }
    );

    expect(mockCalendarEventsInsert).toHaveBeenCalledWith({
      calendarId: "primary",
      requestBody: expect.objectContaining({
        summary: "Pip booking",
        attendees: [{ email: "jamie@example.com" }],
        reminders: {
          useDefault: false,
          overrides: [{ method: "popup", minutes: 30 }],
        },
      }),
    });
    expect(result).toEqual({ id: "evt_99" });
  });

  it("deletes Google calendar events from the primary calendar by default", async () => {
    await deleteGoogleCalendarEvent(
      {
        id: "conn_1",
        accessToken: "token",
        refreshToken: "refresh",
        tokenExpiry: null,
        calendarId: null,
      } as never,
      "evt_1"
    );

    expect(mockCalendarEventsDelete).toHaveBeenCalledWith({
      calendarId: "primary",
      eventId: "evt_1",
    });
  });

  it("maps Square bookings and ignores cancelled statuses upstream", async () => {
    vi.mocked(fetch).mockResolvedValue(
      new Response(
        JSON.stringify({
          bookings: [
            {
              id: "sq_1",
              start_at: "2026-03-12T17:00:00.000Z",
              appointment_segments: [{ duration_minutes: 90 }],
              status: "ACCEPTED",
            },
          ],
        }),
        { status: 200 }
      )
    );

    await expect(
      getSquareBookings(
        {
          accessToken: "token",
          metadata: { locationId: "loc_1" },
        } as never,
        new Date("2026-03-12T00:00:00.000Z"),
        new Date("2026-03-13T00:00:00.000Z")
      )
    ).resolves.toEqual([
      {
        id: "sq_1",
        start: "2026-03-12T17:00:00.000Z",
        end: "2026-03-12T18:30:00.000Z",
        status: "ACCEPTED",
      },
    ]);
  });

  it("creates and deletes Square bookings against the configured location", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ booking: { id: "sq_booking_1" } }), {
          status: 200,
        })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(
      createSquareBooking(
        {
          accessToken: "token",
          metadata: { locationId: "loc_1" },
        } as never,
        {
          startTime: new Date("2026-03-12T17:00:00.000Z"),
          customerName: "Jamie",
          customerPhone: "+16195550100",
          serviceName: "Bath",
          durationMinutes: 60,
        }
      )
    ).resolves.toEqual({ booking: { id: "sq_booking_1" } });

    await deleteSquareBooking(
      {
        accessToken: "token",
        metadata: { locationId: "loc_1" },
      } as never,
      "sq_booking_1"
    );

    expect(fetch).toHaveBeenNthCalledWith(
      1,
      "https://connect.squareup.com/v2/bookings",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"location_id\":\"loc_1\""),
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://connect.squareup.com/v2/bookings/sq_booking_1/cancel",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("maps Acuity appointments and supports create/cancel", async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 1,
              datetime: "2026-03-12T17:00:00.000Z",
              endTime: "2026-03-12T18:00:00.000Z",
              canceled: false,
            },
          ]),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 99 }), { status: 200 })
      )
      .mockResolvedValueOnce(new Response(JSON.stringify({ ok: true }), { status: 200 }));

    await expect(
      getAcuityAppointments(
        {
          accessToken: "api-key",
          metadata: { userId: "acuity-user" },
        } as never,
        new Date("2026-03-12T00:00:00.000Z"),
        new Date("2026-03-13T00:00:00.000Z")
      )
    ).resolves.toEqual([
      {
        id: "1",
        start: "2026-03-12T17:00:00.000Z",
        end: "2026-03-12T18:00:00.000Z",
        status: "confirmed",
      },
    ]);

    await expect(
      createAcuityAppointment(
        {
          accessToken: "api-key",
          metadata: { userId: "acuity-user" },
        } as never,
        {
          startTime: new Date("2026-03-12T17:00:00.000Z"),
          appointmentTypeId: 4,
          customerName: "Jamie Rivera",
          customerEmail: "jamie@example.com",
          customerPhone: "+16195550100",
        }
      )
    ).resolves.toEqual({ id: 99 });

    await cancelAcuityAppointment(
      {
        accessToken: "api-key",
        metadata: { userId: "acuity-user" },
      } as never,
      "99"
    );

    expect(fetch).toHaveBeenNthCalledWith(
      2,
      "https://acuityscheduling.com/api/v1/appointments",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("\"appointmentTypeID\":4"),
      })
    );
    expect(fetch).toHaveBeenNthCalledWith(
      3,
      "https://acuityscheduling.com/api/v1/appointments/99/cancel",
      expect.objectContaining({ method: "PUT" })
    );
  });

  it("returns no slots when the business is closed that day", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      timezone: "America/Los_Angeles",
      businessHours: {
        mon: { open: "9:00 AM", close: "5:00 PM" },
      },
    } as never);

    const slots = await getAvailableSlots("biz_1", "2026-03-15", 60);

    expect(slots).toEqual([]);
  });

  it("skips near-term and conflicting slots when building availability", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T15:30:00.000Z"));
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      timezone: "America/Los_Angeles",
      businessHours: {
        thu: { open: "8:00 AM", close: "12:00 PM" },
      },
    } as never);
    vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([]);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      {
        startTime: new Date("2026-03-12T18:30:00.000Z"),
        endTime: new Date("2026-03-12T19:30:00.000Z"),
      },
    ] as never);

    const slots = await getAvailableSlots("biz_1", "2026-03-12", 60);

    expect(slots.map((slot) => slot.start.toISOString())).toEqual([
      "2026-03-12T16:30:00.000Z",
      "2026-03-12T17:00:00.000Z",
      "2026-03-12T17:30:00.000Z",
    ]);
    vi.useRealTimers();
  });

  it("checks slot availability against overlapping appointments", async () => {
    vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([]);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      {
        startTime: new Date("2026-03-12T17:30:00.000Z"),
        endTime: new Date("2026-03-12T18:30:00.000Z"),
      },
    ] as never);

    await expect(
      isSlotAvailable(
        "biz_1",
        new Date("2026-03-12T17:00:00.000Z"),
        new Date("2026-03-12T18:00:00.000Z")
      )
    ).resolves.toBe(false);
  });

  it("returns sorted conflicts from internal and external calendars", async () => {
    vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([
      {
        provider: "SQUARE",
        accessToken: "token",
        metadata: { locationId: "loc_1" },
      },
      {
        provider: "ACUITY",
        accessToken: "api-key",
        metadata: { userId: "acuity-user" },
      },
    ] as never);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      {
        startTime: new Date("2026-03-12T18:00:00.000Z"),
        endTime: new Date("2026-03-12T19:00:00.000Z"),
        customerName: "Jamie",
        serviceName: "Bath",
      },
    ] as never);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            bookings: [
              {
                id: "sq_1",
                start_at: "2026-03-12T16:00:00.000Z",
                appointment_segments: [{ duration_minutes: 30 }],
                status: "ACCEPTED",
              },
            ],
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([
            {
              id: 7,
              datetime: "2026-03-12T20:00:00.000Z",
              endTime: "2026-03-12T20:30:00.000Z",
              canceled: false,
            },
          ]),
          { status: 200 }
        )
      );

    const conflicts = await getConflicts(
      "biz_1",
      new Date("2026-03-12T00:00:00.000Z"),
      new Date("2026-03-13T00:00:00.000Z")
    );

    expect(conflicts.map((c) => c.source)).toEqual([
      "Square",
      "RingPaw",
      "Acuity",
    ]);
  });

  it("creates a pending appointment with a confirm link for soft booking mode", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      bookingMode: "SOFT",
    } as never);
    vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.service.findFirst).mockResolvedValue({
      name: "Full Groom",
      price: 95,
      bookingMode: "SOFT",
    } as never);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([]);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        appointment: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "appt_1",
            status: "PENDING",
          }),
          update: vi.fn().mockResolvedValue({
            id: "appt_1",
            status: "PENDING",
            confirmLink: "https://confirm.test/appt_1",
          }),
        },
      });
    });

    const appointment = await bookAppointment("biz_1", {
      customerName: "Jamie",
      customerPhone: "+16195550100",
      petName: "Bella",
      serviceName: "Full Groom",
      startTime: new Date("2026-03-12T20:00:00.000Z"),
      endTime: new Date("2026-03-12T21:00:00.000Z"),
    });

    expect(appointment).toEqual({
      id: "appt_1",
      status: "PENDING",
      confirmLink: "https://confirm.test/appt_1",
    });
  });

  it("forces HARD booking mode for test/demo bookings regardless of business setting", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      bookingMode: "SOFT",
    } as never);
    vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.service.findFirst).mockResolvedValue({
      name: "Full Groom",
      price: 95,
      bookingMode: "SOFT",
    } as never);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([]);

    const createMock = vi.fn().mockResolvedValue({
      id: "appt_test",
      status: "CONFIRMED",
    });
    vi.mocked(prisma.$transaction).mockImplementation(async (callback: any) => {
      return callback({
        appointment: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: createMock,
          update: vi.fn(),
        },
      });
    });

    const appointment = await bookAppointment("biz_1", {
      customerName: "Demo User",
      customerPhone: "+16195550100",
      petName: "Luna",
      serviceName: "Full Groom",
      startTime: new Date("2026-03-12T20:00:00.000Z"),
      endTime: new Date("2026-03-12T21:00:00.000Z"),
      isTestBooking: true,
    });

    // Should create with CONFIRMED status (HARD mode), not PENDING
    expect(createMock).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "CONFIRMED",
        bookingMode: "HARD",
      }),
    });
    expect(appointment.status).toBe("CONFIRMED");
  });

  it("syncs external calendar ids after booking to Google, Square, and Acuity", async () => {
    const transactionMock = vi.fn(async (callback: any) =>
      callback({
        appointment: {
          findFirst: vi.fn().mockResolvedValue(null),
          create: vi.fn().mockResolvedValue({
            id: "appt_1",
            status: "CONFIRMED",
          }),
          update: vi.fn(),
        },
      })
    );
    vi.mocked(prisma.$transaction).mockImplementation(transactionMock as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      bookingMode: "HARD",
    } as never);
    vi.mocked(prisma.service.findFirst).mockResolvedValue({
      name: "Bath",
      price: 45,
      bookingMode: "HARD",
    } as never);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([]);
    vi.mocked(prisma.calendarConnection.findMany).mockResolvedValue([]);
    vi.mocked(prisma.appointment.update).mockResolvedValue({
      id: "appt_1",
      calendarEventId: "external_1",
    } as never);

    mockCalendarEventsInsert.mockResolvedValueOnce({ data: { id: "google_evt" } });
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ booking: { id: "square_evt" } }), { status: 200 })
      )
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ id: 88 }), { status: 200 })
      );

    for (const primaryCalendar of [
      { provider: "GOOGLE", calendarId: "primary" },
      { provider: "SQUARE", accessToken: "token", metadata: { locationId: "loc_1" } },
      { provider: "ACUITY", accessToken: "api-key", metadata: { userId: "acuity-user", appointmentTypeId: 2 } },
    ]) {
      vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue(primaryCalendar as never);
      await bookAppointment("biz_1", {
        customerName: "Jamie",
        customerPhone: "+16195550100",
        petName: "Bella",
        serviceName: "Bath",
        startTime: new Date("2026-03-12T20:00:00.000Z"),
        endTime: new Date("2026-03-12T21:00:00.000Z"),
      });
    }

    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_1" },
      data: { calendarEventId: "google_evt" },
    });
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_1" },
      data: { calendarEventId: "square_evt" },
    });
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_1" },
      data: { calendarEventId: "88" },
    });
  });

  it("throws for invalid appointment ranges", async () => {
    await expect(
      bookAppointment("biz_1", {
        customerName: "Jamie",
        startTime: new Date("2026-03-12T21:00:00.000Z"),
        endTime: new Date("2026-03-12T20:00:00.000Z"),
      })
    ).rejects.toThrow("Invalid appointment time range");
  });

  it("parses naive local datetimes and formats slot descriptions", () => {
    expect(
      parseLocalDatetime("2026-03-12T09:30:00", "America/Los_Angeles").toISOString()
    ).toBe("2026-03-12T16:30:00.000Z");

    const description = describeAvailableSlots(
      [
        {
          start: new Date("2026-03-12T17:00:00.000Z"),
          end: new Date("2026-03-12T18:00:00.000Z"),
        },
        {
          start: new Date("2026-03-12T18:30:00.000Z"),
          end: new Date("2026-03-12T19:30:00.000Z"),
        },
      ],
      "America/Los_Angeles"
    );

    expect(description).toContain("10:00 AM");
    expect(description).toContain("11:30 AM");
  });
});
