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
      count: vi.fn(),
      groupBy: vi.fn(),
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    waitlistEntry: {
      count: vi.fn(),
    },
    service: {
      aggregate: vi.fn(),
    },
    rebookingConfig: {
      findUnique: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

describe("GET /api/appointments/stats", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T18:00:00.000Z"));
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.appointment.count).mockReset();
    vi.mocked(prisma.waitlistEntry.count).mockReset();
    vi.mocked(prisma.appointment.groupBy).mockReset();
    vi.mocked(prisma.appointment.findFirst).mockReset();
    vi.mocked(prisma.service.aggregate).mockReset();
    vi.mocked(prisma.appointment.findMany).mockReset();
    vi.mocked(prisma.rebookingConfig.findUnique).mockReset();
  });

  it("returns 401 without auth", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("builds no-show, waitlist, and lapsing-client stats", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({ id: "biz_1" } as never);
    vi.mocked(prisma.appointment.count)
      .mockResolvedValueOnce(20 as never)
      .mockResolvedValueOnce(2 as never)
      .mockResolvedValueOnce(1 as never)
      .mockResolvedValueOnce(10 as never)
      .mockResolvedValueOnce(3 as never);
    vi.mocked(prisma.waitlistEntry.count).mockResolvedValue(4 as never);
    vi.mocked(prisma.appointment.groupBy).mockResolvedValue([
      { customerPhone: "+16195550100", _count: { id: 2 } },
    ] as never);
    vi.mocked(prisma.appointment.findFirst)
      .mockResolvedValueOnce({
        customerName: "Jamie",
        customerPhone: "+16195550100",
        petName: "Buddy",
        startTime: new Date("2026-03-01T18:00:00.000Z"),
      } as never)
      .mockResolvedValueOnce(null as never);
    vi.mocked(prisma.service.aggregate).mockResolvedValue({
      _avg: { price: 80 },
    } as never);
    vi.mocked(prisma.appointment.findMany)
      .mockResolvedValueOnce([
        {
          id: "no_show_1",
          customerName: "Jamie",
          customerPhone: "+16195550100",
          petName: "Buddy",
          serviceName: "Full Groom",
          startTime: new Date("2026-03-01T18:00:00.000Z"),
          noShowMarkedAt: new Date("2026-03-01T19:00:00.000Z"),
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: "pending_1",
          customerName: "Taylor",
          customerPhone: "+16195550101",
          petName: "Luna",
          serviceName: "Bath",
          startTime: new Date("2026-03-13T18:00:00.000Z"),
          status: "PENDING",
          reminder48hSent: false,
          reminderSent: false,
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          customerName: "Alex",
          customerPhone: "+16195550102",
          petName: "Milo",
          completedAt: new Date("2026-01-01T18:00:00.000Z"),
          rebookInterval: null,
        },
      ] as never);
    vi.mocked(prisma.rebookingConfig.findUnique).mockResolvedValue({
      defaultInterval: 42,
    } as never);

    const response = await GET();
    const payload = await response.json();

    expect(payload.stats).toEqual({
      totalAppointments: 20,
      noShowCount: 2,
      cancelledCount: 1,
      confirmedCount: 10,
      noShowRate: 10,
      upcomingUnconfirmed: 3,
      waitlistCount: 4,
      estimatedSaved: 120,
    });
    expect(payload.repeatOffenders).toHaveLength(1);
    expect(payload.lapsingClients).toHaveLength(1);
    expect(payload.pendingConfirmation).toHaveLength(1);
    expect(payload.recentNoShows).toHaveLength(1);
  });
});
