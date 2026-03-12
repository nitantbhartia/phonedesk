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
    behaviorLog: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "./route";

describe("/api/behavior", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.behaviorLog.create).mockReset();
    vi.mocked(prisma.behaviorLog.findMany).mockReset();
  });

  it("rejects unauthorized POSTs", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/behavior", { method: "POST" }) as never);

    expect(response.status).toBe(401);
  });

  it("creates a behavior log with normalized severity and tags", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({ id: "biz_1" } as never);
    vi.mocked(prisma.behaviorLog.create).mockResolvedValue({ id: "log_1" } as never);

    const response = await POST(new Request("http://localhost/api/behavior", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        petName: "Buddy",
        note: "Nervous around dryers",
        severity: "INVALID",
        tags: "not-an-array",
      }),
    }) as never);

    expect(prisma.behaviorLog.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz_1",
        petName: "Buddy",
        customerId: null,
        petId: null,
        appointmentId: null,
        severity: "NOTE",
        note: "Nervous around dryers",
        tags: [],
      },
    });
    await expect(response.json()).resolves.toEqual({ behaviorLog: { id: "log_1" } });
  });

  it("filters GET requests by petId and customerId", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({ id: "biz_1" } as never);
    vi.mocked(prisma.behaviorLog.findMany).mockResolvedValue([{ id: "log_1" }] as never);

    const response = await GET(
      new Request("http://localhost/api/behavior?petId=pet_1&customerId=cust_1") as never
    );

    expect(prisma.behaviorLog.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        petId: "pet_1",
        customerId: "cust_1",
      },
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    await expect(response.json()).resolves.toEqual({ behaviorLogs: [{ id: "log_1" }] });
  });
});
