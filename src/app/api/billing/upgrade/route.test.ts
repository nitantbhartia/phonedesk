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
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/stripe", () => ({
  getStripeClient: vi.fn(),
  getStripePriceIdForPlan: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getStripeClient, getStripePriceIdForPlan } from "@/lib/stripe";
import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/billing/upgrade", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/billing/upgrade", () => {
  const retrieveSubscription = vi.fn();
  const updateSubscription = vi.fn();

  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(getStripeClient).mockReset();
    vi.mocked(getStripePriceIdForPlan).mockReset();
    retrieveSubscription.mockReset();
    updateSubscription.mockReset();

    vi.mocked(getStripeClient).mockReturnValue({
      subscriptions: {
        retrieve: retrieveSubscription,
        update: updateSubscription,
      },
    } as never);
    vi.mocked(getStripePriceIdForPlan).mockReturnValue("price_business");
  });

  it("returns 401 without a signed-in user", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await POST(makeRequest({ plan: "BUSINESS" }) as never);

    expect(response.status).toBe(401);
  });

  it("returns 400 for an invalid target plan", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      business: { id: "biz_1", stripeSubscriptionId: "sub_123" },
    } as never);

    const response = await POST(makeRequest({ plan: "enterprise" }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid plan" });
    expect(getStripePriceIdForPlan).not.toHaveBeenCalled();
  });

  it("returns 400 when there is no active subscription to upgrade", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      business: { id: "biz_1", stripeSubscriptionId: null },
    } as never);

    const response = await POST(makeRequest({ plan: "BUSINESS" }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "No active subscription found. Please subscribe first.",
    });
  });

  it("upgrades the current Stripe subscription inline", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      business: { id: "biz_1", stripeSubscriptionId: "sub_123" },
    } as never);
    retrieveSubscription.mockResolvedValue({
      items: { data: [{ id: "si_123" }] },
    });

    const response = await POST(makeRequest({ plan: "BUSINESS" }) as never);

    expect(getStripePriceIdForPlan).toHaveBeenCalledWith("BUSINESS");
    expect(updateSubscription).toHaveBeenCalledWith("sub_123", {
      items: [{ id: "si_123", price: "price_business" }],
      proration_behavior: "create_prorations",
    });
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("returns 500 when Stripe throws", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      business: { id: "biz_1", stripeSubscriptionId: "sub_123" },
    } as never);
    retrieveSubscription.mockRejectedValue(new Error("stripe down"));

    const response = await POST(makeRequest({ plan: "BUSINESS" }) as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "stripe down" });
  });
});
