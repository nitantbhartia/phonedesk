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
    },
  },
}));

vi.mock("@/lib/stripe", () => ({
  getAppUrl: vi.fn(() => "https://app.example.com"),
  getStripeClient: vi.fn(),
}));

vi.mock("@/lib/stripe-billing", () => ({
  ensureStripeCustomerForBusiness: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getAppUrl, getStripeClient } from "@/lib/stripe";
import { ensureStripeCustomerForBusiness } from "@/lib/stripe-billing";
import { POST } from "./route";

describe("POST /api/billing/portal", () => {
  const createPortalSession = vi.fn();

  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.user.upsert).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(getAppUrl).mockReturnValue("https://app.example.com");
    vi.mocked(getStripeClient).mockReset();
    vi.mocked(ensureStripeCustomerForBusiness).mockReset();
    createPortalSession.mockReset();

    vi.mocked(getStripeClient).mockReturnValue({
      billingPortal: {
        sessions: {
          create: createPortalSession,
        },
      },
    } as never);
    vi.mocked(ensureStripeCustomerForBusiness).mockResolvedValue("cus_123");
    createPortalSession.mockResolvedValue({ url: "https://billing.stripe.test/session" });
  });

  it("returns 401 without a session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when the business is missing", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1", email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Business not found" });
  });

  it("creates a billing portal session for the current business", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1", email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      name: "Paw House",
      email: "biz@example.com",
      stripeCustomerId: "cus_saved",
    } as never);

    const response = await POST();
    const payload = await response.json();

    expect(ensureStripeCustomerForBusiness).toHaveBeenCalledWith({
      businessId: "biz_1",
      businessName: "Paw House",
      businessEmail: "biz@example.com",
      stripeCustomerId: "cus_saved",
    });
    expect(createPortalSession).toHaveBeenCalledWith({
      customer: "cus_123",
      return_url: `${getAppUrl()}/settings/billing`,
    });
    expect(payload).toEqual({ url: "https://billing.stripe.test/session" });
  });

  it("returns 500 when Stripe portal creation fails", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1", email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      name: "Paw House",
      email: "biz@example.com",
      stripeCustomerId: null,
    } as never);
    createPortalSession.mockRejectedValue(new Error("portal down"));

    const response = await POST();

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "portal down" });
  });
});
