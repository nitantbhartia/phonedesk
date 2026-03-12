import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      upsert: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/stripe", () => ({
  getAppUrl: vi.fn(() => "https://app.example.com"),
  getStripeClient: vi.fn(),
  getStripePriceIdForPlan: vi.fn(),
}));

vi.mock("@/lib/stripe-billing", () => ({
  ensureStripeCustomerForBusiness: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import {
  getAppUrl,
  getStripeClient,
  getStripePriceIdForPlan,
} from "@/lib/stripe";
import { ensureStripeCustomerForBusiness } from "@/lib/stripe-billing";
import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/billing/checkout", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/billing/checkout", () => {
  const createSession = vi.fn();

  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.user.upsert).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.business.update).mockReset();
    vi.mocked(getStripeClient).mockReset();
    vi.mocked(getStripePriceIdForPlan).mockReset();
    vi.mocked(getAppUrl).mockReturnValue("https://app.example.com");
    vi.mocked(ensureStripeCustomerForBusiness).mockReset();
    createSession.mockReset();

    vi.mocked(getStripeClient).mockReturnValue({
      checkout: {
        sessions: {
          create: createSession,
        },
      },
    } as never);
    vi.mocked(getStripePriceIdForPlan).mockReturnValue("price_pro");
    vi.mocked(ensureStripeCustomerForBusiness).mockResolvedValue("cus_123");
    vi.mocked(prisma.business.update).mockResolvedValue({ id: "biz_1" } as never);
    createSession.mockResolvedValue({ url: "https://checkout.stripe.test/session" });
  });

  it("returns 401 when there is no authenticated session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await POST(makeRequest({ plan: "PRO" }) as never);

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 400 for an invalid plan", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1", email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);

    const response = await POST(makeRequest({ plan: "free" }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid plan" });
    expect(prisma.business.findUnique).not.toHaveBeenCalled();
  });

  it("returns 404 when the business cannot be found", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1", email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue(null);

    const response = await POST(makeRequest({ plan: "PRO" }) as never);

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Business not found" });
  });

  it("creates a checkout session with safe default redirect URLs", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1", email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      name: "Paw House",
      email: "biz@example.com",
      plan: "STARTER",
      stripeCustomerId: null,
    } as never);

    const response = await POST(
      makeRequest({
        plan: "PRO",
        successUrl: "https://malicious.example/success",
        cancelUrl: "/settings/billing?from=test",
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(ensureStripeCustomerForBusiness).toHaveBeenCalledWith({
      businessId: "biz_1",
      businessName: "Paw House",
      businessEmail: "biz@example.com",
      stripeCustomerId: null,
    });
    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: { billingConsentGiven: true },
    });
    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({
        customer: "cus_123",
        line_items: [{ price: "price_pro", quantity: 1 }],
        success_url: "https://app.example.com/settings/billing?checkout=success",
        cancel_url: "https://app.example.com/settings/billing?from=test",
      })
    );
    expect(payload).toEqual({ url: "https://checkout.stripe.test/session" });
  });

  it("returns 500 when Stripe session creation fails", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1", email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      name: "Paw House",
      email: "biz@example.com",
      plan: "STARTER",
      stripeCustomerId: null,
    } as never);
    createSession.mockRejectedValue(new Error("stripe down"));

    const response = await POST(makeRequest({ plan: "PRO" }) as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "stripe down" });
  });
});
