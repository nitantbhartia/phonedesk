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
import { bookAppointment, isSlotAvailable } from "@/lib/calendar";
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
    vi.mocked(prisma.calendarConnection.findFirst).mockReset();
    vi.mocked(bookAppointment).mockReset();
    vi.mocked(isSlotAvailable).mockReset();
    vi.mocked(tryFillFromWaitlist).mockReset();
    vi.mocked(sendRescheduleConfirmationToCustomer).mockReset();
    vi.mocked(sendRescheduleNotificationToOwner).mockReset();

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
