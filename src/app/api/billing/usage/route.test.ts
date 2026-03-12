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
    call: {
      aggregate: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

describe("GET /api/billing/usage", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T18:00:00.000Z"));
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.call.aggregate).mockReset();
  });

  it("returns 401 without a signed-in email", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 404 when the user has no business", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      business: null,
    } as never);

    const response = await GET();

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "Business not found" });
  });

  it("returns rounded plan usage for the current month", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      business: {
        id: "biz_1",
        plan: "PRO",
        stripeSubscriptionStatus: "active",
      },
    } as never);
    vi.mocked(prisma.call.aggregate).mockResolvedValue({
      _sum: { duration: 9010 },
    } as never);

    const response = await GET();
    const payload = await response.json();

    expect(prisma.call.aggregate).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        createdAt: { gte: new Date(2026, 2, 1) },
        duration: { not: null },
        isTestCall: false,
      },
      _sum: { duration: true },
    });
    expect(payload).toMatchObject({
      minutesUsed: 150,
      minutesLimit: 300,
      minutesRemaining: 150,
      overageMinutes: 0,
      percentUsed: 50,
      plan: "PRO",
      planName: "Studio",
      subscriptionStatus: "active",
    });
  });
});
