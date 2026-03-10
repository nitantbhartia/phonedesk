import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Module mocks ────────────────────────────────────────────────────────────

vi.mock("@/lib/retell-auth", () => ({
  isRetellWebhookValid: vi.fn(() => true),
}));

vi.mock("@/lib/demo-session", () => ({
  resolveBusinessFromDemo: vi.fn(async () => null),
}));

vi.mock("@/lib/calendar", () => ({
  isSlotAvailable: vi.fn(async () => true),
  bookAppointment: vi.fn(),
  parseLocalDatetime: vi.fn((dt: string) => new Date("2026-06-15T09:00:00.000Z")),
}));

vi.mock("@/lib/notifications", () => ({
  sendBookingNotificationToOwner: vi.fn(async () => {}),
  sendBookingConfirmationToCustomer: vi.fn(async () => {}),
}));

vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(async () => {}),
}));

vi.mock("@/lib/customer-memory", () => ({
  upsertCustomerMemory: vi.fn(async () => ({ id: "cust_1" })),
}));

vi.mock("@/crm/withFallback", () => ({
  getCRMWithFallback: vi.fn(async () => ({
    getCRMType: () => "none",
  })),
}));

// Stable mock stripe instance so tests can inspect the same spy object
const mockStripeSubscriptionsUpdate = vi.fn(async () => ({}));
const mockStripeClient = {
  subscriptions: { update: mockStripeSubscriptionsUpdate },
};

vi.mock("@/lib/stripe", () => ({
  getStripeClient: vi.fn(() => mockStripeClient),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: { findFirst: vi.fn() },
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    groomer: { findFirst: vi.fn(async () => null) },
    call: { updateMany: vi.fn(async () => {}) },
    customer: {
      updateMany: vi.fn(async () => {}),
      findUnique: vi.fn(async () => null),
    },
    intakeForm: { create: vi.fn(async () => ({ token: "tok_1" })) },
  },
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { resolveBusinessFromDemo } from "@/lib/demo-session";
import { bookAppointment, isSlotAvailable } from "@/lib/calendar";

// ─── Shared test fixtures ─────────────────────────────────────────────────────

const REAL_BUSINESS_ID = "biz_real_1";
const DEMO_BUSINESS_ID = "biz_demo_1";

const baseBusiness = {
  id: REAL_BUSINESS_ID,
  name: "Fluffy Paws Grooming",
  phone: "+16195550001",
  timezone: "America/Los_Angeles",
  bookingMode: "HARD",
  services: [{ id: "svc_1", name: "Full Groom", price: 75, duration: 60, isActive: true, isAddon: false }],
  stripeCustomerId: "cus_stripe_1",
  stripeSubscriptionId: "sub_stripe_1",
  stripeSubscriptionStatus: "trialing",
  bookingsCount: 0,
};

const baseAppointment = {
  id: "appt_1",
  status: "CONFIRMED",
  customerName: "Jane Smith",
  customerPhone: "+16195550002",
  petName: "Fluffy",
  startTime: new Date("2026-06-15T09:00:00.000Z"),
  endTime: new Date("2026-06-15T10:00:00.000Z"),
  isTestBooking: false,
};

function buildRequest(toNumber: string, fromNumber = "+16195550002") {
  const body = JSON.stringify({
    args: {
      customer_name: "Jane Smith",
      customer_phone: fromNumber,
      pet_name: "Fluffy",
      pet_breed: "Poodle",
      pet_size: "MEDIUM",
      service_name: "Full Groom",
      start_time: "2026-06-15T09:00:00",
    },
    call: {
      call_id: "retell_call_1",
      to_number: toNumber,
      from_number: fromNumber,
    },
  });

  return new Request("http://localhost/api/retell/book-appointment", {
    method: "POST",
    body,
    headers: { "content-type": "application/json", "x-retell-signature": "valid" },
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/retell/book-appointment — real vs test booking differentiation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockStripeSubscriptionsUpdate.mockClear();

    // Default: called number resolves to a real PhoneNumber record
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      businessId: REAL_BUSINESS_ID,
      business: { ...baseBusiness },
    } as never);

    // Default: not a demo session
    vi.mocked(resolveBusinessFromDemo).mockResolvedValue(null);

    // Default: slot is available
    vi.mocked(isSlotAvailable).mockResolvedValue(true);

    // Default: bookAppointment returns a confirmed appointment
    vi.mocked(bookAppointment).mockResolvedValue({ ...baseAppointment } as never);

    // Default: business.findUnique for notifications returns the business with phoneNumber
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      ...baseBusiness,
      phoneNumber: { number: "+16195550001" },
    } as never);

    // Default: business.update (bookingsCount increment) returns count = 1, still trialing
    vi.mocked(prisma.business.update).mockResolvedValue({
      bookingsCount: 1,
      stripeSubscriptionId: "sub_stripe_1",
      stripeSubscriptionStatus: "trialing",
      phone: "+16195550001",
    } as never);
  });

  // ── Real bookings ────────────────────────────────────────────────────────

  describe("real bookings (called via own PhoneNumber)", () => {
    it("increments bookingsCount for a real booking", async () => {
      const req = buildRequest("+16195559999");
      await POST(req as never);

      expect(prisma.business.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { bookingsCount: { increment: 1 } },
        })
      );
    });

    it("ends the Stripe trial on the first real booking when subscription is trialing", async () => {
      vi.mocked(prisma.business.update).mockResolvedValue({
        bookingsCount: 1,
        stripeSubscriptionId: "sub_stripe_1",
        stripeSubscriptionStatus: "trialing",
        phone: "+16195550001",
      } as never);

      const req = buildRequest("+16195559999");
      await POST(req as never);

      expect(mockStripeSubscriptionsUpdate).toHaveBeenCalledWith("sub_stripe_1", {
        trial_end: "now",
      });
    });

    it("does not end the trial when bookingsCount > 1 (not the first booking)", async () => {
      vi.mocked(prisma.business.update).mockResolvedValue({
        bookingsCount: 5,
        stripeSubscriptionId: "sub_stripe_1",
        stripeSubscriptionStatus: "trialing",
        phone: "+16195550001",
      } as never);

      const req = buildRequest("+16195559999");
      await POST(req as never);

      expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled();
    });

    it("does not end the trial when subscription is already active (not trialing)", async () => {
      vi.mocked(prisma.business.update).mockResolvedValue({
        bookingsCount: 1,
        stripeSubscriptionId: "sub_stripe_1",
        stripeSubscriptionStatus: "active",
        phone: "+16195550001",
      } as never);

      const req = buildRequest("+16195559999");
      await POST(req as never);

      expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled();
    });

    it("stores isTestBooking=false on the appointment", async () => {
      const req = buildRequest("+16195559999");
      await POST(req as never);

      expect(bookAppointment).toHaveBeenCalledWith(
        REAL_BUSINESS_ID,
        expect.objectContaining({ isTestBooking: false })
      );
    });

    it("returns booked=true with a success message", async () => {
      const req = buildRequest("+16195559999");
      const response = await POST(req as never);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.booked).toBe(true);
      expect(payload.appointment_id).toBe("appt_1");
    });
  });

  // ── Test/demo bookings ───────────────────────────────────────────────────

  describe("test/demo bookings (called via demo session number)", () => {
    beforeEach(() => {
      // Simulate a demo call: PhoneNumber lookup fails, DemoSession resolves business
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);
      vi.mocked(resolveBusinessFromDemo).mockResolvedValue(DEMO_BUSINESS_ID);

      vi.mocked(prisma.business.findUnique).mockImplementation(async ({ where }) => {
        // First call: resolving demoBusiness with services
        // Second call: fetching fullBusiness for notifications
        return {
          ...baseBusiness,
          id: DEMO_BUSINESS_ID,
          phoneNumber: { number: "+16195550001" },
          services: baseBusiness.services,
        } as never;
      });
    });

    it("does NOT increment bookingsCount for a demo/test booking", async () => {
      const req = buildRequest("+16195550100"); // demo number
      await POST(req as never);

      expect(prisma.business.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: { bookingsCount: { increment: 1 } },
        })
      );
    });

    it("does NOT end the Stripe trial for a demo/test booking even when trialing", async () => {
      const req = buildRequest("+16195550100");
      await POST(req as never);

      expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled();
    });

    it("stores isTestBooking=true on the appointment", async () => {
      const req = buildRequest("+16195550100");
      await POST(req as never);

      expect(bookAppointment).toHaveBeenCalledWith(
        DEMO_BUSINESS_ID,
        expect.objectContaining({ isTestBooking: true })
      );
    });

    it("still returns booked=true so the demo call completes normally", async () => {
      vi.mocked(bookAppointment).mockResolvedValue({
        ...baseAppointment,
        id: "appt_demo_1",
        isTestBooking: true,
      } as never);

      const req = buildRequest("+16195550100");
      const response = await POST(req as never);
      const payload = await response.json();

      expect(response.status).toBe(200);
      expect(payload.booked).toBe(true);
    });

    it("does not end trial even if this would have been the 'first' booking by count", async () => {
      // Ensure update is never called at all for demo bookings (count stays at 0)
      const req = buildRequest("+16195550100");
      await POST(req as never);

      expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled();
      // bookingsCount stays at 0 — trial end is deferred to first real booking
      expect(prisma.business.update).not.toHaveBeenCalled();
    });
  });

  // ── Edge cases ───────────────────────────────────────────────────────────

  describe("edge cases", () => {
    it("returns an error message when the slot is not available", async () => {
      vi.mocked(isSlotAvailable).mockResolvedValue(false);

      const req = buildRequest("+16195559999");
      const response = await POST(req as never);
      const payload = await response.json();

      expect(payload.booked).toBe(false);
      expect(payload.result).toContain("no longer available");
      expect(prisma.business.update).not.toHaveBeenCalled();
    });

    it("returns an error when business cannot be resolved from either PhoneNumber or DemoSession", async () => {
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);
      vi.mocked(resolveBusinessFromDemo).mockResolvedValue(null);

      const req = buildRequest("+16195550000");
      const response = await POST(req as never);
      const payload = await response.json();

      expect(payload.booked).toBeUndefined();
      expect(payload.result).toContain("trouble accessing");
      expect(prisma.business.update).not.toHaveBeenCalled();
    });

    it("does not end trial when subscription ID is missing", async () => {
      vi.mocked(prisma.business.update).mockResolvedValue({
        bookingsCount: 1,
        stripeSubscriptionId: null,
        stripeSubscriptionStatus: "trialing",
        phone: "+16195550001",
      } as never);

      const req = buildRequest("+16195559999");
      await POST(req as never);

      expect(mockStripeSubscriptionsUpdate).not.toHaveBeenCalled();
    });
  });
});
