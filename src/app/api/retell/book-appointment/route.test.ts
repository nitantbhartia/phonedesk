import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: {
      findFirst: vi.fn(),
    },
    groomer: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    customer: {
      updateMany: vi.fn(),
      update: vi.fn(),
      findUnique: vi.fn(),
    },
    call: {
      findUnique: vi.fn(),
      updateMany: vi.fn(),
    },
    appointment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    intakeForm: {
      create: vi.fn(),
      findFirst: vi.fn(),
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

vi.mock("@/lib/stripe", () => ({
  getStripeClient: vi.fn(),
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
    vi.mocked(prisma.call.findUnique).mockReset();
    vi.mocked(prisma.call.updateMany).mockReset();
    vi.mocked(prisma.appointment.findUnique).mockReset();
    vi.mocked(prisma.appointment.update).mockReset();
    vi.mocked(prisma.appointment.update).mockResolvedValue({} as never);
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.intakeForm.create).mockReset();
    vi.mocked(prisma.intakeForm.findFirst).mockReset();
    vi.mocked(prisma.groomer.findMany).mockReset();
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
      getCustomer: vi.fn(async () => null),
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
    expect(payload.result).toContain("customer's name, service, and appointment time");
    expect(isSlotAvailable).not.toHaveBeenCalled();
  });

  it("does not book when the service is missing even if the time is present", async () => {
    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Jamie",
          start_time: "2026-05-21T09:00:00",
        },
        call: { from_number: "+16195550100", to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(false);
    expect(payload.result).toContain("service");
    expect(bookAppointment).not.toHaveBeenCalled();
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

  it("books successfully with service_id even when service_name is omitted", async () => {
    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Jamie",
          service_id: "svc_1",
          start_time: "2026-05-21T09:00:00",
        },
        call: { from_number: "+16195550100", to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(true);
    expect(bookAppointment).toHaveBeenCalledWith(
      "biz_1",
      expect.objectContaining({
        serviceName: "Full Groom",
        servicePrice: 95,
      })
    );
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

  // Fix #5 — service name not found should block booking
  it("returns an error and does not book when service_name does not match any active service", async () => {
    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Jamie",
          start_time: "2026-05-21T09:00:00",
          service_name: "Invisible Cut",
        },
        call: { from_number: "+16195550100", to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(false);
    expect(payload.result).toContain("Invisible Cut");
    expect(payload.result).toContain("Full Groom");
    expect(bookAppointment).not.toHaveBeenCalled();
  });

  // Fix #7 — groomer not found should return structured feedback
  it("returns groomer_not_found and a corrective prompt when the groomer name doesn't match", async () => {
    vi.mocked(prisma.groomer.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.groomer.findMany).mockResolvedValue([
      { name: "Taylor" },
      { name: "Riley" },
    ] as never);

    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Jamie",
          start_time: "2026-05-21T09:00:00",
          service_name: "Full Groom",
          groomer_name: "Jessica",
        },
        call: { from_number: "+16195550100", to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(false);
    expect(payload.groomer_not_found).toBe(true);
    expect(payload.result).toContain("Jessica");
    expect(payload.result).toContain("Taylor");
    expect(bookAppointment).not.toHaveBeenCalled();
  });

  it("returns addon_not_found and does not book when the add-on name does not match", async () => {
    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Jamie",
          start_time: "2026-05-21T09:00:00",
          service_name: "Full Groom",
          addon_service_name: "Blueberry Facial",
        },
        call: { from_number: "+16195550100", to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(false);
    expect(payload.addon_not_found).toBe(true);
    expect(payload.result).toContain("Blueberry Facial");
    expect(bookAppointment).not.toHaveBeenCalled();
  });

  // Fix #11 — intake form should not be sent twice for the same customer
  it("does not send a second intake form if one was already sent for this customer", async () => {
    vi.mocked(prisma.intakeForm.findFirst).mockResolvedValue({
      id: "existing_form",
    } as never);
    vi.mocked(prisma.customer.findUnique).mockResolvedValue(null);

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
          from_number: "+16195550100",
          to_number: "+16195559999",
        },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(true);
    expect(prisma.intakeForm.create).not.toHaveBeenCalled();
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

  it("reuses an existing MoeGo customer instead of creating a duplicate on first booking", async () => {
    const getCustomer = vi.fn(async () => ({ id: "moego_existing" }));
    const createCustomer = vi.fn(async () => ({ id: "moego_new" }));
    vi.mocked(upsertCustomerMemory).mockResolvedValue({
      id: "cust_1",
      moegoCustomerId: null,
    } as never);
    vi.mocked(getCRMWithFallback).mockResolvedValue({
      getCRMType: () => "moego",
      getCustomer,
      createCustomer,
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
          from_number: "+16195550100",
          to_number: "+16195559999",
        },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(true);
    expect(getCustomer).toHaveBeenCalledWith("+16195550100");
    expect(createCustomer).not.toHaveBeenCalled();
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: "cust_1" },
      data: { moegoCustomerId: "moego_existing" },
    });
  });

  it("creates a MoeGo customer when no existing external record matches the caller phone", async () => {
    const getCustomer = vi.fn(async () => null);
    const createCustomer = vi.fn(async () => ({ id: "moego_new" }));
    vi.mocked(upsertCustomerMemory).mockResolvedValue({
      id: "cust_1",
      moegoCustomerId: null,
    } as never);
    vi.mocked(getCRMWithFallback).mockResolvedValue({
      getCRMType: () => "moego",
      getCustomer,
      createCustomer,
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
          from_number: "+16195550100",
          to_number: "+16195559999",
        },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(true);
    expect(getCustomer).toHaveBeenCalledWith("+16195550100");
    expect(createCustomer).toHaveBeenCalledWith({
      name: "Jamie",
      phone: "+16195550100",
    });
    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: "cust_1" },
      data: { moegoCustomerId: "moego_new" },
    });
  });

  it("skips customer memory writes, crm sync, and intake form for demo/test bookings", async () => {
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
    expect(prisma.intakeForm.create).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════
  // IDEMPOTENCY: duplicate booking prevention
  // ═══════════════════════════════════════════════════════════════════

  describe("idempotency — duplicate booking prevention (critical)", () => {
    it("returns the existing confirmed booking instead of double-booking", async () => {
      vi.mocked(prisma.call.findUnique).mockResolvedValue({
        appointmentId: "appt_existing",
      } as never);
      vi.mocked(prisma.appointment.findUnique).mockResolvedValue({
        id: "appt_existing",
        status: "CONFIRMED",
        petName: "Luna",
        serviceName: "Full Groom",
        startTime: new Date("2026-05-21T16:00:00.000Z"),
      } as never);

      const response = await POST(
        makeRequest({
          args: {
            customer_name: "Jamie",
            service_name: "Full Groom",
            start_time: "2026-05-21T09:00:00",
          },
          call: {
            call_id: "call_idempotent",
            from_number: "+16195550100",
            to_number: "+16195559999",
          },
        }) as never
      );
      const payload = await response.json();

      expect(payload.booked).toBe(true);
      expect(payload.confirmed).toBe(true);
      expect(payload.appointment_id).toBe("appt_existing");
      expect(payload.result).toContain("Luna");
      expect(bookAppointment).not.toHaveBeenCalled();
    });

    it("returns the existing pending booking with appropriate message", async () => {
      vi.mocked(prisma.call.findUnique).mockResolvedValue({
        appointmentId: "appt_pending",
      } as never);
      vi.mocked(prisma.appointment.findUnique).mockResolvedValue({
        id: "appt_pending",
        status: "PENDING",
        petName: "Buddy",
        serviceName: "Bath",
        startTime: new Date("2026-05-21T16:00:00.000Z"),
      } as never);

      const response = await POST(
        makeRequest({
          args: {
            customer_name: "Jamie",
            service_name: "Bath",
            start_time: "2026-05-21T09:00:00",
          },
          call: {
            call_id: "call_pending_idem",
            from_number: "+16195550100",
            to_number: "+16195559999",
          },
        }) as never
      );
      const payload = await response.json();

      expect(payload.booked).toBe(true);
      expect(payload.confirmed).toBe(false);
      expect(payload.result).toContain("held for");
      expect(bookAppointment).not.toHaveBeenCalled();
    });

    it("proceeds with booking when call has no existing appointment", async () => {
      vi.mocked(prisma.call.findUnique).mockResolvedValue({
        appointmentId: null,
      } as never);

      const response = await POST(
        makeRequest({
          args: {
            customer_name: "Jamie",
            service_name: "Full Groom",
            start_time: "2026-05-21T09:00:00",
          },
          call: {
            call_id: "call_no_appt",
            from_number: "+16195550100",
            to_number: "+16195559999",
          },
        }) as never
      );
      const payload = await response.json();

      expect(payload.booked).toBe(true);
      expect(bookAppointment).toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // INVALID DATE / TIME HANDLING
  // ═══════════════════════════════════════════════════════════════════

  describe("invalid date/time handling", () => {
    it("returns a clarification prompt when parseLocalDatetime produces NaN", async () => {
      vi.mocked(parseLocalDatetime).mockReturnValue(new Date("invalid"));

      const response = await POST(
        makeRequest({
          args: {
            customer_name: "Jamie",
            service_name: "Full Groom",
            start_time: "sometime next week maybe",
          },
          call: {
            from_number: "+16195550100",
            to_number: "+16195559999",
          },
        }) as never
      );
      const payload = await response.json();

      expect(payload.booked).toBe(false);
      expect(payload.result).toContain("time didn't come through");
      expect(isSlotAvailable).not.toHaveBeenCalled();
      expect(bookAppointment).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // BOOKING ERROR RECOVERY
  // ═══════════════════════════════════════════════════════════════════

  describe("booking error recovery", () => {
    it("returns a retry message when bookAppointment throws unexpectedly", async () => {
      vi.mocked(bookAppointment).mockRejectedValue(new Error("calendar write failed"));

      const response = await POST(
        makeRequest({
          args: {
            customer_name: "Jamie",
            service_name: "Full Groom",
            start_time: "2026-05-21T09:00:00",
          },
          call: {
            from_number: "+16195550100",
            to_number: "+16195559999",
          },
        }) as never
      );
      const payload = await response.json();

      expect(payload.booked).toBe(false);
      expect(payload.result).toContain("wasn't able to complete the booking");
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // VACCINE STATUS HANDLING
  // ═══════════════════════════════════════════════════════════════════

  describe("vaccine status handling", () => {
    it("passes vaccine notes to bookAppointment and persists vaccineStatus", async () => {
      const response = await POST(
        makeRequest({
          args: {
            customer_name: "Jamie",
            pet_name: "Buddy",
            service_name: "Full Groom",
            start_time: "2026-05-21T09:00:00",
            vaccine_status: "confirmed",
          },
          call: {
            from_number: "+16195550100",
            to_number: "+16195559999",
          },
        }) as never
      );
      const payload = await response.json();

      expect(payload.booked).toBe(true);
      expect(bookAppointment).toHaveBeenCalledWith(
        "biz_1",
        expect.objectContaining({
          notes: "Vaccine status: Owner confirmed rabies current, Bordetella current",
        })
      );
      expect(prisma.appointment.update).toHaveBeenCalledWith({
        where: { id: "appt_default" },
        data: { vaccineStatus: "confirmed" },
      });
    });

    it("does not set notes when vaccine_status is absent", async () => {
      const response = await POST(
        makeRequest({
          args: {
            customer_name: "Jamie",
            pet_name: "Buddy",
            service_name: "Full Groom",
            start_time: "2026-05-21T09:00:00",
          },
          call: {
            from_number: "+16195550100",
            to_number: "+16195559999",
          },
        }) as never
      );
      const payload = await response.json();

      expect(payload.booked).toBe(true);
      expect(bookAppointment).toHaveBeenCalledWith(
        "biz_1",
        expect.objectContaining({
          notes: undefined,
        })
      );
      expect(prisma.appointment.update).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ADD-ON SERVICE PRICING & DURATION
  // ═══════════════════════════════════════════════════════════════════

  describe("add-on service combined pricing and duration", () => {
    const businessWithAddon = {
      ...businessRecord,
      services: [
        ...businessRecord.services,
        {
          id: "svc_addon",
          businessId: "biz_1",
          name: "Teeth Brushing",
          price: 15,
          duration: 15,
          isActive: true,
          isAddon: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    };

    it("combines primary service and add-on pricing and duration", async () => {
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
        business: businessWithAddon,
      } as never);

      const response = await POST(
        makeRequest({
          args: {
            customer_name: "Jamie",
            pet_name: "Buddy",
            service_name: "Full Groom",
            addon_service_name: "Teeth Brushing",
            start_time: "2026-05-21T09:00:00",
          },
          call: {
            from_number: "+16195550100",
            to_number: "+16195559999",
          },
        }) as never
      );
      const payload = await response.json();

      expect(payload.booked).toBe(true);
      expect(bookAppointment).toHaveBeenCalledWith(
        "biz_1",
        expect.objectContaining({
          serviceName: "Full Groom + Teeth Brushing",
          servicePrice: 110, // 95 + 15
        })
      );
      // End time should include combined duration (90 + 15 = 105 min)
      const callArgs = vi.mocked(bookAppointment).mock.calls[0][1];
      const expectedEnd = new Date(
        new Date("2026-05-21T16:00:00.000Z").getTime() + 105 * 60000
      );
      expect(callArgs.endTime).toEqual(expectedEnd);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // TRIAL BILLING: first real booking ends trial
  // ═══════════════════════════════════════════════════════════════════

  describe("trial billing on first real booking", () => {
    it("ends the Stripe trial when first real booking is made during trial", async () => {
      vi.mocked(prisma.business.update).mockResolvedValue({
        id: "biz_1",
        bookingsCount: 1,
        stripeSubscriptionId: "sub_trial_1",
        stripeSubscriptionStatus: "trialing",
        phone: "+16195550000",
      } as never);

      const mockStripe = {
        subscriptions: { update: vi.fn().mockResolvedValue({}) },
      };
      const { getStripeClient } = await import("@/lib/stripe");
      vi.mocked(getStripeClient).mockReturnValue(mockStripe as never);

      const response = await POST(
        makeRequest({
          args: {
            customer_name: "Jamie",
            pet_name: "Buddy",
            service_name: "Full Groom",
            start_time: "2026-05-21T09:00:00",
          },
          call: {
            from_number: "+16195550100",
            to_number: "+16195559999",
          },
        }) as never
      );
      const payload = await response.json();

      expect(payload.booked).toBe(true);
      expect(mockStripe.subscriptions.update).toHaveBeenCalledWith("sub_trial_1", {
        trial_end: "now",
      });
      // Should send activation SMS
      expect(sendSms).toHaveBeenCalledWith(
        "+16195550000",
        expect.stringContaining("plan is now active"),
        expect.any(String)
      );
    });

    it("does not end trial or send SMS for demo/test bookings", async () => {
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);
      vi.mocked(resolveBusinessFromDemo).mockResolvedValue("demo_biz");
      vi.mocked(prisma.business.findUnique).mockResolvedValue({
        ...businessRecord,
        id: "demo_biz",
        phoneNumber: { number: "+17165763523" },
      } as never);

      await POST(
        makeRequest({
          args: {
            customer_name: "Jamie",
            pet_name: "Buddy",
            service_name: "Full Groom",
            start_time: "2026-05-21T09:00:00",
          },
          call: {
            call_id: "call_demo_trial",
            from_number: "+16195550100",
            to_number: "+17165763523",
          },
        }) as never
      );

      // business.update (bookingsCount increment) should NOT be called
      expect(prisma.business.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            bookingsCount: expect.anything(),
          }),
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CALL LINKING FAILURE IS NON-FATAL
  // ═══════════════════════════════════════════════════════════════════

  it("still returns booked=true when call-to-appointment linking fails", async () => {
    vi.mocked(prisma.call.updateMany).mockRejectedValue(new Error("db link failed"));

    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Jamie",
          pet_name: "Buddy",
          service_name: "Full Groom",
          start_time: "2026-05-21T09:00:00",
        },
        call: {
          call_id: "call_link_fail",
          from_number: "+16195550100",
          to_number: "+16195559999",
        },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(true);
  });

  // ═══════════════════════════════════════════════════════════════════
  // CUSTOMER MEMORY FAILURE IS NON-FATAL
  // ═══════════════════════════════════════════════════════════════════

  it("still returns booked=true when upsertCustomerMemory fails", async () => {
    vi.mocked(upsertCustomerMemory).mockRejectedValue(new Error("memory write failed"));

    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Jamie",
          pet_name: "Buddy",
          service_name: "Full Groom",
          start_time: "2026-05-21T09:00:00",
        },
        call: {
          from_number: "+16195550100",
          to_number: "+16195559999",
        },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(true);
    // CRM sync should still be skipped since customer memory returned null
    expect(getCRMWithFallback).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════
  // RETURNING CUSTOMER SHOULD NOT GET INTAKE FORM
  // ═══════════════════════════════════════════════════════════════════

  it("does not send intake form for returning customers (visitCount > 0)", async () => {
    vi.mocked(prisma.customer.findUnique).mockResolvedValue({
      id: "cust_returning",
      visitCount: 3,
    } as never);

    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Sarah",
          customer_phone: "+16195550100",
          pet_name: "Max",
          service_name: "Full Groom",
          start_time: "2026-05-21T09:00:00",
        },
        call: {
          from_number: "+16195550100",
          to_number: "+16195559999",
        },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(true);
    expect(prisma.intakeForm.create).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════
  // PET SIZE VALIDATION
  // ═══════════════════════════════════════════════════════════════════

  describe("pet size validation", () => {
    it("normalizes lowercase pet size to uppercase", async () => {
      const response = await POST(
        makeRequest({
          args: {
            customer_name: "Jamie",
            pet_name: "Buddy",
            pet_size: "large",
            service_name: "Full Groom",
            start_time: "2026-05-21T09:00:00",
          },
          call: {
            from_number: "+16195550100",
            to_number: "+16195559999",
          },
        }) as never
      );
      const payload = await response.json();

      expect(payload.booked).toBe(true);
      expect(bookAppointment).toHaveBeenCalledWith(
        "biz_1",
        expect.objectContaining({
          petSize: "LARGE",
        })
      );
    });

    it("ignores invalid pet size values", async () => {
      const response = await POST(
        makeRequest({
          args: {
            customer_name: "Jamie",
            pet_name: "Buddy",
            pet_size: "gigantic",
            service_name: "Full Groom",
            start_time: "2026-05-21T09:00:00",
          },
          call: {
            from_number: "+16195550100",
            to_number: "+16195559999",
          },
        }) as never
      );
      const payload = await response.json();

      expect(payload.booked).toBe(true);
      expect(bookAppointment).toHaveBeenCalledWith(
        "biz_1",
        expect.objectContaining({
          petSize: undefined,
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // BUSINESS RESOLUTION: no business found
  // ═══════════════════════════════════════════════════════════════════

  it("returns a graceful retry message when no business can be resolved", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);
    vi.mocked(resolveBusinessFromDemo).mockResolvedValue(null);

    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Jamie",
          service_name: "Full Groom",
          start_time: "2026-05-21T09:00:00",
        },
        call: {
          from_number: "+16195550100",
          to_number: "+10000000000",
        },
      }) as never
    );
    const payload = await response.json();

    expect(payload.result).toContain("trouble accessing the booking system");
    expect(bookAppointment).not.toHaveBeenCalled();
  });

  // ═══════════════════════════════════════════════════════════════════
  // CUSTOMER PHONE NORMALIZATION
  // ═══════════════════════════════════════════════════════════════════

  it("uses customer_phone arg over call.from_number when provided", async () => {
    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Jamie",
          customer_phone: "(858) 555-0200",
          service_name: "Full Groom",
          start_time: "2026-05-21T09:00:00",
        },
        call: {
          from_number: "+16195550100",
          to_number: "+16195559999",
        },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(true);
    expect(bookAppointment).toHaveBeenCalledWith(
      "biz_1",
      expect.objectContaining({
        customerPhone: "+18585550200",
      })
    );
  });

  // ═══════════════════════════════════════════════════════════════════
  // TEST BOOKING INHERITS isTestCall FROM CALL RECORD
  // ═══════════════════════════════════════════════════════════════════

  it("inherits isTestCall from the Call record for onboarding test calls", async () => {
    vi.mocked(prisma.call.findUnique).mockResolvedValue({
      isTestCall: true,
    } as never);

    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Jamie",
          pet_name: "Buddy",
          service_name: "Full Groom",
          start_time: "2026-05-21T09:00:00",
        },
        call: {
          call_id: "call_onboarding_test",
          from_number: "+16195550100",
          to_number: "+16195559999",
        },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(true);
    expect(bookAppointment).toHaveBeenCalledWith(
      "biz_1",
      expect.objectContaining({
        isTestBooking: true,
      })
    );
    expect(upsertCustomerMemory).not.toHaveBeenCalled();
  });

  it("sends SMS notifications for demo bookings using the demo number when no phoneNumber record exists", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);
    vi.mocked(resolveBusinessFromDemo).mockResolvedValue("demo_biz");
    // First call: resolve business with services (no phoneNumber join)
    // Second call: fullBusiness lookup — no phoneNumber record
    vi.mocked(prisma.business.findUnique)
      .mockResolvedValueOnce({
        ...businessRecord,
        id: "demo_biz",
      } as never)
      .mockResolvedValueOnce({
        ...businessRecord,
        id: "demo_biz",
        phoneNumber: null,
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
          call_id: "call_demo_sms",
          from_number: "+16195550100",
          to_number: "+17165763523",
        },
      }) as never
    );
    const payload = await response.json();

    expect(payload.booked).toBe(true);
    // Notification functions should be called with the demo number as phoneNumber
    expect(sendBookingNotificationToOwner).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumber: { number: "+17165763523" },
      }),
      expect.any(Object)
    );
    expect(sendBookingConfirmationToCustomer).toHaveBeenCalledWith(
      expect.objectContaining({
        phoneNumber: { number: "+17165763523" },
      }),
      expect.any(Object)
    );
  });
});
