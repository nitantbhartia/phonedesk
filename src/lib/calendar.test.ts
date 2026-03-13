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
  createGoogleCalendarEvent,
  describeAvailableSlots,
  getAvailableSlots,
  getGoogleCalendarEvents,
  isSlotAvailable,
  parseLocalDatetime,
} from "./calendar";
import { prisma } from "@/lib/prisma";

describe("calendar helpers", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    process.env.NEXT_PUBLIC_APP_URL = "http://localhost:3000";
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
