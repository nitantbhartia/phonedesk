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
      findFirst: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
    },
    behaviorLog: {
      findMany: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET } from "./route";

describe("GET /api/behavior/brief", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.appointment.findFirst).mockReset();
    vi.mocked(prisma.customer.findFirst).mockReset();
    vi.mocked(prisma.behaviorLog.findMany).mockReset();
  });

  it("returns 400 when appointmentId is missing", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({ id: "biz_1" } as never);

    const response = await GET(new Request("http://localhost/api/behavior/brief") as never);

    expect(response.status).toBe(400);
  });

  it("builds a behavior summary from matched customer and pet records", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({ id: "biz_1" } as never);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: "appt_1",
      businessId: "biz_1",
      customerPhone: "+16195550100",
      petName: "Buddy",
      petBreed: null,
      petSize: null,
    } as never);
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({
      id: "cust_1",
      pets: [{ id: "pet_1", name: "Buddy", breed: "Poodle", size: "MEDIUM" }],
    } as never);
    vi.mocked(prisma.behaviorLog.findMany).mockResolvedValue([
      {
        id: "log_1",
        severity: "HIGH_RISK",
        note: "Needs muzzle for nails",
        tags: ["muzzle", "nails"],
        createdAt: new Date("2026-03-01T12:00:00.000Z"),
      },
      {
        id: "log_2",
        severity: "CAUTION",
        note: "Sensitive paws",
        tags: ["paws"],
        createdAt: new Date("2026-02-01T12:00:00.000Z"),
      },
    ] as never);

    const response = await GET(
      new Request("http://localhost/api/behavior/brief?appointmentId=appt_1") as never
    );
    const payload = await response.json();

    expect(prisma.behaviorLog.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        OR: [{ petId: "pet_1" }, { customerId: "cust_1" }, { petName: { equals: "Buddy", mode: "insensitive" } }],
      },
      orderBy: { createdAt: "desc" },
      take: 20,
    });
    expect(payload.highRisk).toBe(true);
    expect(payload.breed).toBe("Poodle");
    expect(payload.size).toBe("MEDIUM");
    expect(payload.behaviorSummary).toContain("2 behavior note(s) on file.");
    expect(payload.behaviorSummary).toContain("1 HIGH RISK flag(s).");
    expect(payload.behaviorSummary).toContain("1 CAUTION flag(s).");
    expect(payload.behaviorSummary).toContain("Tags: muzzle, nails, paws.");
  });
});
