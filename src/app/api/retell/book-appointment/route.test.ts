import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: {
      findFirst: vi.fn(),
    },
    groomer: {
      findFirst: vi.fn(),
    },
    customer: {
      updateMany: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    call: {
      updateMany: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    intakeForm: {
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/calendar", () => ({
  bookAppointment: vi.fn(),
  isSlotAvailable: vi.fn(),
  parseLocalDatetime: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  sendBookingNotificationToOwner: vi.fn(),
  sendBookingConfirmationToCustomer: vi.fn(),
}));

vi.mock("@/lib/customer-memory", () => ({
  upsertCustomerMemory: vi.fn(),
}));

vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(),
}));

vi.mock("@/lib/retell-auth", () => ({
  isRetellWebhookValid: vi.fn(),
}));

vi.mock("@/crm/withFallback", () => ({
  getCRMWithFallback: vi.fn(),
}));

vi.mock("@/lib/demo-session", () => ({
  resolveBusinessFromDemo: vi.fn(),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import {
  bookAppointment,
  isSlotAvailable,
  parseLocalDatetime,
} from "@/lib/calendar";
import {
  sendBookingConfirmationToCustomer,
  sendBookingNotificationToOwner,
} from "@/lib/notifications";
import { upsertCustomerMemory } from "@/lib/customer-memory";
import { sendSms } from "@/lib/sms";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { getCRMWithFallback } from "@/crm/withFallback";
import { resolveBusinessFromDemo } from "@/lib/demo-session";

function makeRequest(body: unknown, signature = "sig") {
  return new Request("http://localhost/api/retell/book-appointment", {
    method: "POST",
    headers: { "content-type": "application/json", "x-retell-signature": signature },
    body: JSON.stringify(body),
  });
}

const businessRecord = {
  id: "biz_1",
  name: "Paw House",
  timezone: "America/Los_Angeles",
  phone: "+16195550000",
  services: [
    {
      id: "svc_1",
      businessId: "biz_1",
      name: "Full Groom",
      price: 95,
      duration: 90,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  ],
};

describe("POST /api/retell/book-appointment", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";

    vi.mocked(isRetellWebhookValid).mockReturnValue(true);
    vi.mocked(prisma.phoneNumber.findFirst).mockReset();
    vi.mocked(prisma.groomer.findFirst).mockReset();
    vi.mocked(prisma.customer.updateMany).mockReset();
    vi.mocked(prisma.customer.update).mockReset();
    vi.mocked(prisma.customer.findUnique).mockReset();
    vi.mocked(prisma.call.updateMany).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.intakeForm.create).mockReset();
    vi.mocked(bookAppointment).mockReset();
    vi.mocked(isSlotAvailable).mockReset();
    vi.mocked(parseLocalDatetime).mockReset();
    vi.mocked(sendBookingNotificationToOwner).mockReset();
    vi.mocked(sendBookingConfirmationToCustomer).mockReset();
    vi.mocked(upsertCustomerMemory).mockReset();
    vi.mocked(sendSms).mockReset();
    vi.mocked(getCRMWithFallback).mockReset();
    vi.mocked(resolveBusinessFromDemo).mockReset();

    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: businessRecord,
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      ...businessRecord,
      phoneNumber: { number: "+16195559999" },
    } as never);
    vi.mocked(prisma.business.update).mockResolvedValue({ id: "biz_1" } as never);
    vi.mocked(parseLocalDatetime).mockReturnValue(
      new Date("2026-05-21T16:00:00.000Z")
    );
    vi.mocked(isSlotAvailable).mockResolvedValue(true);
    vi.mocked(bookAppointment).mockResolvedValue({
      id: "appt_default",
      status: "CONFIRMED",
      customerName: "Jamie",
      customerPhone: "+16195550100",
      petName: "Buddy",
      serviceName: "Full Groom",
      startTime: new Date("2026-05-21T16:00:00.000Z"),
    } as never);
    vi.mocked(prisma.customer.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.intakeForm.create).mockResolvedValue({
      token: "intake_123",
    } as never);
    vi.mocked(upsertCustomerMemory).mockResolvedValue({
      id: "cust_1",
    } as never);
    vi.mocked(getCRMWithFallback).mockResolvedValue({
      getCRMType: () => "square",
      createCustomer: vi.fn(async () => ({ id: "sq_123" })),
    } as never);
  });

  it("rejects unauthorized booking tool requests", async () => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(false);

    const response = await POST(
      makeRequest({ args: {}, call: { call_id: "call_1" } }) as never
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns a validation prompt when required booking details are missing", async () => {
    const response = await POST(
      makeRequest({
        args: { customer_name: "Jamie" },
        call: { from_number: "+16195550100", to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(false);
    expect(payload.result).toContain("customer's name and appointment time");
    expect(isSlotAvailable).not.toHaveBeenCalled();
  });

  it("auto-corrects hallucinated past years before checking availability", async () => {
    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Jamie",
          start_time: "2024-05-21T09:00:00",
          service_name: "Full Groom",
        },
        call: { from_number: "+16195550100", to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(parseLocalDatetime).toHaveBeenCalledWith(
      "2026-05-21T09:00:00",
      "America/Los_Angeles"
    );
    expect(payload.booked).toBe(true);
  });

  it("returns an alternate-time prompt when the slot is no longer available", async () => {
    vi.mocked(isSlotAvailable).mockResolvedValue(false);

    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Jamie",
          start_time: "2026-05-21T09:00:00",
          service_name: "Full Groom",
        },
        call: { from_number: "+16195550100", to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(false);
    expect(payload.result).toContain("slot is no longer available");
    expect(bookAppointment).not.toHaveBeenCalled();
  });

  it("books the appointment, links the call, syncs customer data, and sends follow-up messages", async () => {
    vi.mocked(prisma.groomer.findFirst).mockResolvedValue({
      id: "groomer_1",
      name: "Taylor",
    } as never);
    vi.mocked(bookAppointment).mockResolvedValue({
      id: "appt_1",
      status: "CONFIRMED",
      customerName: "Jamie",
      customerPhone: "+16195550100",
      petName: "Buddy",
      serviceName: "Full Groom",
      startTime: new Date("2026-05-21T16:00:00.000Z"),
    } as never);

    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Jamie",
          customer_phone: "(619) 555-0100",
          pet_name: "Buddy",
          pet_breed: "Poodle",
          pet_size: "MEDIUM",
          service_name: "Full Groom",
          start_time: "2026-05-21T09:00:00",
          groomer_name: "Taylor",
        },
        call: {
          call_id: "call_5",
          from_number: "+16195550100",
          to_number: "+16195559999",
        },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(true);
    expect(payload.confirmed).toBe(true);
    expect(payload.appointment_id).toBe("appt_1");
    expect(bookAppointment).toHaveBeenCalledWith("biz_1", {
      customerName: "Jamie",
      customerPhone: "+16195550100",
      petName: "Buddy",
      petBreed: "Poodle",
      petSize: "MEDIUM",
      serviceName: "Full Groom",
      servicePrice: 95,
      startTime: new Date("2026-05-21T16:00:00.000Z"),
      endTime: new Date("2026-05-21T17:30:00.000Z"),
      groomerId: "groomer_1",
      isTestBooking: false,
    });
    expect(prisma.customer.updateMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        phone: "+16195550100",
      },
      data: { preferredGroomerId: "groomer_1" },
    });
    expect(upsertCustomerMemory).toHaveBeenCalledWith({
      businessId: "biz_1",
      customerName: "Jamie",
      customerPhone: "+16195550100",
      petName: "Buddy",
      petBreed: "Poodle",
      petSize: "MEDIUM",
      serviceName: "Full Groom",
      appointmentStart: new Date("2026-05-21T16:00:00.000Z"),
    });
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: "cust_1" },
      data: { squareCustomerId: "sq_123" },
    });
    expect(prisma.call.updateMany).toHaveBeenCalledWith({
      where: { retellCallId: "call_5" },
      data: { appointmentId: "appt_1" },
    });
    expect(sendBookingNotificationToOwner).toHaveBeenCalled();
    expect(sendBookingConfirmationToCustomer).toHaveBeenCalled();
    expect(prisma.intakeForm.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz_1",
        customerPhone: "+16195550100",
        customerName: "Jamie",
        appointmentId: "appt_1",
      },
    });
    expect(sendSms).toHaveBeenCalledWith(
      "+16195550100",
      expect.stringContaining("https://app.example.com/intake/intake_123"),
      "+16195559999"
    );
  });

  it("keeps the booking successful when downstream notifications or crm sync fail", async () => {
    vi.mocked(bookAppointment).mockResolvedValue({
      id: "appt_2",
      status: "PENDING",
      customerName: "Jamie",
      customerPhone: "+16195550100",
      petName: "Buddy",
      serviceName: "Full Groom",
      startTime: new Date("2026-05-21T16:00:00.000Z"),
      confirmLink: "https://confirm.example.com/token",
    } as never);
    vi.mocked(getCRMWithFallback).mockResolvedValue({
      getCRMType: () => "square",
      createCustomer: vi.fn(async () => {
        throw new Error("square unavailable");
      }),
    } as never);
    vi.mocked(sendBookingNotificationToOwner).mockRejectedValue(
      new Error("owner sms failed")
    );
    vi.mocked(sendBookingConfirmationToCustomer).mockRejectedValue(
      new Error("customer sms failed")
    );
    vi.mocked(sendSms).mockRejectedValue(new Error("intake sms failed"));

    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Jamie",
          customer_phone: "+16195550100",
          pet_name: "Buddy",
          service_name: "Full Groom",
          start_time: "2026-05-21T09:00:00",
        },
        call: {
          call_id: "call_6",
          from_number: "+16195550100",
          to_number: "+16195559999",
        },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(true);
    expect(payload.confirmed).toBe(false);
    expect(prisma.customer.update).not.toHaveBeenCalled();
  });

  it("skips customer memory writes and crm sync for demo/test bookings", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);
    vi.mocked(resolveBusinessFromDemo).mockResolvedValue("demo_biz");
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      ...businessRecord,
      id: "demo_biz",
      phoneNumber: { number: "+17165763523" },
    } as never);

    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Jamie",
          customer_phone: "+16195550100",
          pet_name: "Buddy",
          service_name: "Full Groom",
          start_time: "2026-05-21T09:00:00",
        },
        call: {
          call_id: "call_demo_booking",
          from_number: "+16195550100",
          to_number: "+17165763523",
        },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(true);
    expect(bookAppointment).toHaveBeenCalledWith(
      "demo_biz",
      expect.objectContaining({
        isTestBooking: true,
      })
    );
    expect(upsertCustomerMemory).not.toHaveBeenCalled();
    expect(getCRMWithFallback).not.toHaveBeenCalled();
  });
});
