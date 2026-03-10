import { beforeEach, describe, expect, it, vi } from "vitest";

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: {
      update: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(async () => []),
    },
    retellConfig: {
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(async () => {}),
}));

const mockSubscriptionsCancel = vi.fn(async () => ({}));
const mockSubscriptionsUpdate = vi.fn(async () => ({}));
const mockWebhooksConstructEvent = vi.fn();

vi.mock("@/lib/stripe", () => ({
  getStripeClient: vi.fn(() => ({
    subscriptions: {
      cancel: mockSubscriptionsCancel,
      update: mockSubscriptionsUpdate,
    },
    webhooks: {
      constructEvent: mockWebhooksConstructEvent,
    },
  })),
  getPlanForStripePriceId: vi.fn(() => "STARTER"),
}));

// ─── Imports (after mocks) ────────────────────────────────────────────────────

import { POST } from "./route";
import { prisma } from "@/lib/prisma";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const STRIPE_WEBHOOK_SECRET = "whsec_test";

function buildRequest(rawBody: string) {
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    body: rawBody,
    headers: {
      "content-type": "application/json",
      "stripe-signature": "t=123,v1=abc",
    },
  });
}

function makeSubscription(overrides: Record<string, unknown> = {}) {
  return {
    id: "sub_1",
    customer: "cus_1",
    status: "trialing",
    items: { data: [{ price: { id: "price_starter" } }] },
    ...overrides,
  };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("POST /api/stripe/webhook", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.STRIPE_WEBHOOK_SECRET = STRIPE_WEBHOOK_SECRET;
    // Default: constructEvent succeeds
    mockWebhooksConstructEvent.mockImplementation((_body, _sig, _secret) => ({
      type: "unknown.event",
      data: { object: {} },
    }));
  });

  // ── trial_will_end ───────────────────────────────────────────────────────

  describe("customer.subscription.trial_will_end", () => {
    function setTrialWillEndEvent(sub = makeSubscription()) {
      mockWebhooksConstructEvent.mockReturnValue({
        type: "customer.subscription.trial_will_end",
        data: { object: sub },
      });
    }

    it("cancels the subscription and notifies owner when bookingsCount is 0 (no real bookings)", async () => {
      setTrialWillEndEvent();
      vi.mocked(prisma.business.findFirst).mockResolvedValue({
        id: "biz_1",
        bookingsCount: 0,
        phone: "+16195550001",
        phoneNumber: { number: "+16195559999" },
      } as never);

      const req = buildRequest("{}");
      const res = await POST(req as never);

      expect(res.status).toBe(200);
      expect(mockSubscriptionsCancel).toHaveBeenCalledWith("sub_1");
    });

    it("sends the owner an SMS when cancelling due to no real bookings", async () => {
      const { sendSms } = await import("@/lib/sms");
      setTrialWillEndEvent();
      vi.mocked(prisma.business.findFirst).mockResolvedValue({
        id: "biz_1",
        bookingsCount: 0,
        phone: "+16195550001",
        phoneNumber: { number: "+16195559999" },
      } as never);

      await POST(buildRequest("{}") as never);

      expect(sendSms).toHaveBeenCalledWith(
        "+16195550001",
        expect.stringContaining("no charge"),
        "+16195559999"
      );
    });

    it("does NOT cancel when bookingsCount >= 1 (first real booking already ended the trial)", async () => {
      setTrialWillEndEvent();
      vi.mocked(prisma.business.findFirst).mockResolvedValue({
        id: "biz_1",
        bookingsCount: 3,
        phone: "+16195550001",
        phoneNumber: { number: "+16195559999" },
      } as never);

      const req = buildRequest("{}");
      await POST(req as never);

      expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
    });

    it("does NOT cancel when bookingsCount is exactly 1 (one real booking, trial ended early)", async () => {
      setTrialWillEndEvent();
      vi.mocked(prisma.business.findFirst).mockResolvedValue({
        id: "biz_1",
        bookingsCount: 1,
        phone: "+16195550001",
        phoneNumber: null,
      } as never);

      await POST(buildRequest("{}") as never);

      expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
    });

    it("cancels when ONLY demo/test bookings were made (bookingsCount stays 0 because demo bookings are excluded)", async () => {
      // This is the key test: demo bookings never increment bookingsCount,
      // so even if the agent booked during a test call, the trial still cancels
      // if no real customer booking was ever made.
      setTrialWillEndEvent();
      vi.mocked(prisma.business.findFirst).mockResolvedValue({
        id: "biz_1",
        bookingsCount: 0, // demo bookings don't increment this
        phone: "+16195550001",
        phoneNumber: { number: "+16195559999" },
      } as never);

      await POST(buildRequest("{}") as never);

      expect(mockSubscriptionsCancel).toHaveBeenCalledWith("sub_1");
    });

    it("does nothing when business cannot be found for the Stripe customer", async () => {
      setTrialWillEndEvent();
      vi.mocked(prisma.business.findFirst).mockResolvedValue(null);

      await POST(buildRequest("{}") as never);

      expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
    });

    it("does nothing when customerId is missing from the subscription object", async () => {
      mockWebhooksConstructEvent.mockReturnValue({
        type: "customer.subscription.trial_will_end",
        data: { object: makeSubscription({ customer: null }) },
      });

      await POST(buildRequest("{}") as never);

      expect(mockSubscriptionsCancel).not.toHaveBeenCalled();
      expect(prisma.business.findFirst).not.toHaveBeenCalled();
    });
  });

  // ── checkout.session.completed ────────────────────────────────────────────

  describe("checkout.session.completed", () => {
    it("stores stripeCustomerId and stripeSubscriptionId on the business", async () => {
      mockWebhooksConstructEvent.mockReturnValue({
        type: "checkout.session.completed",
        data: {
          object: {
            metadata: { businessId: "biz_1" },
            customer: "cus_1",
            subscription: "sub_1",
          },
        },
      });

      await POST(buildRequest("{}") as never);

      expect(prisma.business.update).toHaveBeenCalledWith({
        where: { id: "biz_1" },
        data: { stripeCustomerId: "cus_1", stripeSubscriptionId: "sub_1" },
      });
    });
  });

  // ── subscription.created / updated ───────────────────────────────────────

  describe("customer.subscription.created/updated", () => {
    it("activates the business when subscription status is 'trialing'", async () => {
      mockWebhooksConstructEvent.mockReturnValue({
        type: "customer.subscription.created",
        data: { object: makeSubscription({ status: "trialing" }) },
      });

      await POST(buildRequest("{}") as never);

      expect(prisma.business.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: true, stripeSubscriptionStatus: "trialing" }),
        })
      );
    });

    it("activates the business when subscription status is 'active'", async () => {
      mockWebhooksConstructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: { object: makeSubscription({ status: "active" }) },
      });

      await POST(buildRequest("{}") as never);

      expect(prisma.business.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: true, stripeSubscriptionStatus: "active" }),
        })
      );
    });

    it("does NOT set isActive for non-trialing/active statuses", async () => {
      mockWebhooksConstructEvent.mockReturnValue({
        type: "customer.subscription.updated",
        data: { object: makeSubscription({ status: "past_due" }) },
      });

      await POST(buildRequest("{}") as never);

      const call = vi.mocked(prisma.business.updateMany).mock.calls[0];
      expect(call?.[0]?.data).not.toHaveProperty("isActive");
    });
  });

  // ── subscription.deleted / paused ────────────────────────────────────────

  describe("customer.subscription.deleted", () => {
    it("disables call answering and downgrades plan when subscription is deleted", async () => {
      mockWebhooksConstructEvent.mockReturnValue({
        type: "customer.subscription.deleted",
        data: { object: makeSubscription({ status: "canceled" }) },
      });
      vi.mocked(prisma.business.findMany).mockResolvedValue([{ id: "biz_1" }] as never);

      await POST(buildRequest("{}") as never);

      expect(prisma.business.updateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ isActive: false, plan: "STARTER" }),
        })
      );
    });
  });

  // ── Signature verification ────────────────────────────────────────────────

  describe("signature verification", () => {
    it("returns 400 when the stripe-signature header is missing", async () => {
      const req = new Request("http://localhost/api/stripe/webhook", {
        method: "POST",
        body: "{}",
        headers: { "content-type": "application/json" },
      });

      const res = await POST(req as never);
      expect(res.status).toBe(400);
    });

    it("returns 400 when the signature is invalid", async () => {
      mockWebhooksConstructEvent.mockImplementation(() => {
        throw new Error("Invalid signature");
      });

      const res = await POST(buildRequest("{}") as never);
      expect(res.status).toBe(400);
    });
  });
});
