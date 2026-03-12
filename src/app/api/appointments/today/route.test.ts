import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: {
      findUnique: vi.fn(),
    },
    appointment: {
      findMany: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

describe("GET /api/appointments/today", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T18:00:00.000Z"));
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.appointment.findMany).mockReset();
  });

  it("returns 401 without a session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("returns an empty list when the user has no business", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue(null);

    const response = await GET();

    await expect(response.json()).resolves.toEqual({ appointments: [] });
  });

  it("loads today's appointments in the business timezone", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      timezone: "America/Los_Angeles",
    } as never);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([{ id: "appt_1" }] as never);

    const response = await GET();

    expect(prisma.appointment.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        startTime: {
          gte: new Date("2026-03-12T00:00:00"),
          lte: new Date("2026-03-12T23:59:59"),
        },
        status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
      },
      orderBy: { startTime: "asc" },
      select: {
        id: true,
        customerName: true,
        customerPhone: true,
        petName: true,
        petBreed: true,
        serviceName: true,
        startTime: true,
        endTime: true,
        status: true,
        groomingStatus: true,
        groomingStatusAt: true,
      },
    });
    await expect(response.json()).resolves.toEqual({ appointments: [{ id: "appt_1" }] });
  });
});
