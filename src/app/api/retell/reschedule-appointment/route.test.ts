import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: {
      findFirst: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
    appointment: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    calendarConnection: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/retell-auth", () => ({
  isRetellWebhookValid: vi.fn(),
}));

vi.mock("@/lib/demo-session", () => ({
  resolveBusinessFromDemo: vi.fn(),
}));

vi.mock("@/lib/calendar", () => ({
  bookAppointment: vi.fn(),
  cancelAcuityAppointment: vi.fn(),
  deleteGoogleCalendarEvent: vi.fn(),
  deleteSquareBooking: vi.fn(),
  isSlotAvailable: vi.fn(),
  parseLocalDatetime: vi.fn((value: string) => new Date(value)),
}));

vi.mock("@/lib/waitlist", () => ({
  tryFillFromWaitlist: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  sendRescheduleConfirmationToCustomer: vi.fn(),
  sendRescheduleNotificationToOwner: vi.fn(),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import {
  bookAppointment,
  cancelAcuityAppointment,
  deleteGoogleCalendarEvent,
  deleteSquareBooking,
  isSlotAvailable,
  parseLocalDatetime,
} from "@/lib/calendar";
import { tryFillFromWaitlist } from "@/lib/waitlist";
import {
  sendRescheduleConfirmationToCustomer,
  sendRescheduleNotificationToOwner,
} from "@/lib/notifications";

const businessRecord = {
  id: "biz_1",
  name: "Paw House",
  ownerName: "Jordan",
  phone: "+16195550000",
  address: "123 Main St",
  timezone: "America/Los_Angeles",
  phoneNumber: { number: "+16195559999" },
  services: [
    {
      id: "svc_1",
      businessId: "biz_1",
      name: "Full Groom",
      price: 95,
      duration: 90,
      isActive: true,
      isAddon: false,
    },
  ],
};

const currentAppointment = {
  id: "appt_1",
  businessId: "biz_1",
  customerName: "Jamie",
  customerPhone: "+16195550100",
  petName: "Buddy",
  petBreed: "Golden Retriever",
  petSize: "LARGE",
  serviceName: "Full Groom",
  servicePrice: 95,
  startTime: new Date("2026-05-21T16:00:00Z"),
  endTime: new Date("2026-05-21T17:30:00Z"),
  status: "CONFIRMED",
  bookingMode: "SOFT",
  notes: null,
  reminderSent: false,
  reminder48hSent: false,
  onMyWaySent: false,
  confirmedAt: null,
  noShowMarkedAt: null,
  groomingStatus: null,
  groomingStatusAt: null,
  pickupNotifiedAt: null,
  completedAt: null,
  rebookSent: false,
  rebookInterval: null,
  reviewRequested: false,
  isTestBooking: false,
  groomerToken: null,
  groomerId: null,
  calendarEventId: null,
  confirmLink: null,
  createdAt: new Date(),
  updatedAt: new Date(),
};

const secondAppointment = {
  ...currentAppointment,
  id: "appt_2",
  petName: "Bella",
  startTime: new Date("2026-05-22T16:00:00Z"),
  endTime: new Date("2026-05-22T17:30:00Z"),
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/retell/reschedule-appointment", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-retell-signature": "sig",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/retell/reschedule-appointment", () => {
  beforeEach(() => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(true);
    vi.mocked(prisma.phoneNumber.findFirst).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.appointment.findFirst).mockReset();
    vi.mocked(prisma.appointment.findMany).mockReset();
    vi.mocked(prisma.appointment.update).mockReset();
    vi.mocked(prisma.appointment.delete).mockReset();
    vi.mocked(prisma.calendarConnection.findFirst).mockReset();
    vi.mocked(bookAppointment).mockReset();
    vi.mocked(isSlotAvailable).mockReset();
    vi.mocked(tryFillFromWaitlist).mockReset();
    vi.mocked(sendRescheduleConfirmationToCustomer).mockReset();
    vi.mocked(sendRescheduleNotificationToOwner).mockReset();
    vi.mocked(deleteGoogleCalendarEvent).mockReset();
    vi.mocked(deleteSquareBooking).mockReset();
    vi.mocked(cancelAcuityAppointment).mockReset();
    vi.mocked(parseLocalDatetime).mockReset();
    vi.mocked(parseLocalDatetime).mockImplementation(
      (value: string) => new Date(value)
    );

    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: businessRecord,
    } as never);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue(
      [currentAppointment] as never
    );
    vi.mocked(isSlotAvailable).mockResolvedValue(true);
    vi.mocked(tryFillFromWaitlist).mockResolvedValue(null);
    vi.mocked(sendRescheduleConfirmationToCustomer).mockResolvedValue(undefined);
    vi.mocked(sendRescheduleNotificationToOwner).mockResolvedValue(undefined);
    vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue(null);
  });

  it("rejects unauthorized requests", async () => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(false);

    const response = await POST(makeRequest({ args: {}, call: {} }) as never);

    expect(response.status).toBe(401);
  });

  it("returns appointment options when the caller has multiple upcoming bookings", async () => {
    vi.mocked(prisma.appointment.findMany).mockResolvedValue(
      [currentAppointment, secondAppointment] as never
    );

    const response = await POST(
      makeRequest({
        args: {},
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.rescheduled).toBe(false);
    expect(payload.multiple_appointments).toHaveLength(2);
    expect(payload.multiple_appointments[0].appointment_id).toBe("appt_1");
    expect(payload.multiple_appointments[1].appointment_id).toBe("appt_2");
    expect(bookAppointment).not.toHaveBeenCalled();
  });

  it("asks for the booking name when neither phone nor name is available", async () => {
    const response = await POST(
      makeRequest({
        args: {},
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.rescheduled).toBe(false);
    expect(payload.result).toContain("need the name on the booking");
  });

  it("returns a friendly fallback when no business can be resolved", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);

    const response = await POST(
      makeRequest({
        args: {},
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.rescheduled).toBe(false);
    expect(payload.result).toContain("wasn't able to reach the booking system");
  });

  it("returns a clear message when the provided appointment id cannot be found", async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null);

    const response = await POST(
      makeRequest({
        args: { appointment_id: "missing_appt" },
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.rescheduled).toBe(false);
    expect(payload.result).toContain("couldn't find that appointment");
  });

  it("asks for a new day and time when only the current appointment is identified", async () => {
    const response = await POST(
      makeRequest({
        args: {},
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.rescheduled).toBe(false);
    expect(payload.appointment_id).toBe("appt_1");
    expect(payload.result).toContain("What new day and time would you like instead");
  });

  it("rejects appointments that are already in a terminal state", async () => {
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      { ...currentAppointment, status: "COMPLETED" },
    ] as never);

    const response = await POST(
      makeRequest({
        args: { new_start_time: "2026-05-23T10:00:00" },
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.rescheduled).toBe(false);
    expect(payload.result).toContain("already in progress or completed");
  });

  it("asks the caller to repeat the time when parsing fails", async () => {
    vi.mocked(parseLocalDatetime).mockReturnValue(new Date("invalid"));

    const response = await POST(
      makeRequest({
        args: { new_start_time: "next blurstday" },
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.rescheduled).toBe(false);
    expect(payload.result).toContain("didn't come through clearly");
  });

  it("returns early when the new time matches the current appointment", async () => {
    const response = await POST(
      makeRequest({
        args: { new_start_time: "2026-05-21T09:00:00-07:00" },
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.rescheduled).toBe(true);
    expect(payload.result).toContain("already set for");
    expect(bookAppointment).not.toHaveBeenCalled();
  });

  it("moves the appointment to the new slot and notifies owner and customer", async () => {
    const newAppointment = {
      ...currentAppointment,
      id: "appt_new",
      startTime: new Date("2026-05-23T17:00:00Z"),
      endTime: new Date("2026-05-23T18:30:00Z"),
      status: "PENDING",
      confirmLink: "https://confirm.example.com/new",
    };
    vi.mocked(bookAppointment).mockResolvedValue(newAppointment as never);
    vi.mocked(prisma.appointment.update)
      .mockResolvedValueOnce({
        ...newAppointment,
        status: "CONFIRMED",
        bookingMode: "SOFT",
        confirmLink: null,
      } as never)
      .mockResolvedValueOnce({
        ...currentAppointment,
        status: "CANCELLED",
      } as never);

    const response = await POST(
      makeRequest({
        args: { new_start_time: "2026-05-23T10:00:00" },
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.rescheduled).toBe(true);
    expect(payload.appointment_id).toBe("appt_new");
    expect(bookAppointment).toHaveBeenCalledWith(
      "biz_1",
      expect.objectContaining({
        customerName: "Jamie",
        petName: "Buddy",
        serviceName: "Full Groom",
      })
    );
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_1" },
      data: { status: "CANCELLED" },
    });
    expect(sendRescheduleNotificationToOwner).toHaveBeenCalled();
    expect(sendRescheduleConfirmationToCustomer).toHaveBeenCalled();
  });

  it("rolls back the replacement appointment if cancelling the original one fails", async () => {
    const newAppointment = {
      ...currentAppointment,
      id: "appt_new",
      startTime: new Date("2026-05-23T17:00:00Z"),
      endTime: new Date("2026-05-23T18:30:00Z"),
      status: "PENDING",
      confirmLink: "https://confirm.example.com/new",
    };
    vi.mocked(bookAppointment).mockResolvedValue(newAppointment as never);
    vi.mocked(prisma.appointment.update)
      .mockResolvedValueOnce({
        ...newAppointment,
        status: "CONFIRMED",
        bookingMode: "SOFT",
        confirmLink: null,
      } as never)
      .mockRejectedValueOnce(new Error("cancel failed"));
    vi.mocked(prisma.appointment.delete).mockResolvedValue(newAppointment as never);

    const response = await POST(
      makeRequest({
        args: { new_start_time: "2026-05-23T10:00:00" },
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.rescheduled).toBe(false);
    expect(prisma.appointment.delete).toHaveBeenCalledWith({
      where: { id: "appt_new" },
    });
  });

  it("still succeeds when waitlist refill throws after the move is completed", async () => {
    const newAppointment = {
      ...currentAppointment,
      id: "appt_new",
      startTime: new Date("2026-05-23T17:00:00Z"),
      endTime: new Date("2026-05-23T18:30:00Z"),
      status: "PENDING",
      confirmLink: "https://confirm.example.com/new",
    };
    vi.mocked(bookAppointment).mockResolvedValue(newAppointment as never);
    vi.mocked(prisma.appointment.update)
      .mockResolvedValueOnce({
        ...newAppointment,
        status: "CONFIRMED",
        bookingMode: "SOFT",
        confirmLink: null,
      } as never)
      .mockResolvedValueOnce({
        ...currentAppointment,
        status: "CANCELLED",
      } as never);
    vi.mocked(tryFillFromWaitlist).mockRejectedValue(new Error("waitlist down"));

    const response = await POST(
      makeRequest({
        args: { new_start_time: "2026-05-23T10:00:00" },
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.rescheduled).toBe(true);
    expect(sendRescheduleNotificationToOwner).toHaveBeenCalled();
    expect(sendRescheduleConfirmationToCustomer).toHaveBeenCalled();
  });

  it("cleans up external Google calendar events after a successful move", async () => {
    const newAppointment = {
      ...currentAppointment,
      id: "appt_new",
      startTime: new Date("2026-05-23T17:00:00Z"),
      endTime: new Date("2026-05-23T18:30:00Z"),
      status: "PENDING",
      confirmLink: "https://confirm.example.com/new",
    };
    vi.mocked(bookAppointment).mockResolvedValue(newAppointment as never);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      { ...currentAppointment, calendarEventId: "google_evt" },
    ] as never);
    vi.mocked(prisma.appointment.update)
      .mockResolvedValueOnce({
        ...newAppointment,
        status: "CONFIRMED",
        bookingMode: "SOFT",
        confirmLink: null,
      } as never)
      .mockResolvedValueOnce({
        ...currentAppointment,
        status: "CANCELLED",
      } as never);
    vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue({
      provider: "GOOGLE",
    } as never);

    const response = await POST(
      makeRequest({
        args: { new_start_time: "2026-05-23T10:00:00" },
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );

    expect(response.status).toBe(200);
    expect(deleteGoogleCalendarEvent).toHaveBeenCalledWith(
      expect.objectContaining({ provider: "GOOGLE" }),
      "google_evt"
    );
  });

  it("returns a retry prompt when the new slot is no longer available", async () => {
    vi.mocked(isSlotAvailable).mockResolvedValue(false);

    const response = await POST(
      makeRequest({
        args: { new_start_time: "2026-05-23T10:00:00" },
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.rescheduled).toBe(false);
    expect(payload.result).toContain("no longer available");
    expect(bookAppointment).not.toHaveBeenCalled();
  });
});
