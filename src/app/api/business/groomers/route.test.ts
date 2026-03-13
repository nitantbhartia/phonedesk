import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/retell", () => ({
  syncRetellAgent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    groomer: {
      findMany: vi.fn(),
      updateMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/route-helpers", () => ({
  requireCurrentBusiness: vi.fn(),
  parseJsonBody: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { parseJsonBody, requireCurrentBusiness } from "@/lib/route-helpers";
import { DELETE, GET, POST } from "./route";
import { syncRetellAgent } from "@/lib/retell";

describe("POST /api/business/groomers", () => {
  beforeEach(() => {
    vi.mocked(requireCurrentBusiness).mockReset();
    vi.mocked(parseJsonBody).mockReset();
    vi.mocked(requireCurrentBusiness).mockResolvedValue({
      business: { id: "biz_1" },
      userId: "user_1",
    } as never);
    vi.mocked(prisma.groomer.findMany).mockReset();
    vi.mocked(prisma.groomer.updateMany).mockReset();
    vi.mocked(prisma.groomer.findFirst).mockReset();
    vi.mocked(prisma.groomer.update).mockReset();
    vi.mocked(prisma.groomer.upsert).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(syncRetellAgent).mockReset();
  });

  it("rejects updates for groomers outside the current business", async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({
      data: {
        groomers: [{ id: "groomer_foreign", name: "Alex" }],
      },
    } as never);
    vi.mocked(prisma.groomer.findFirst).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/business/groomers") as never);
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toContain("Groomer not found");
    expect(prisma.groomer.update).not.toHaveBeenCalled();
  });

  it("lists only active groomers for the business", async () => {
    vi.mocked(prisma.groomer.findMany).mockResolvedValue([
      { id: "g_1", name: "Alex" },
    ] as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(prisma.groomer.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1", isActive: true },
      orderBy: { createdAt: "asc" },
    });
    await expect(response.json()).resolves.toEqual({
      groomers: [{ id: "g_1", name: "Alex" }],
    });
  });

  it("creates groomers and syncs Retell when config exists", async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({
      data: {
        groomers: [{ name: "Alex", specialties: ["Doodles", "  Baths  "] }],
      },
    } as never);
    vi.mocked(prisma.groomer.upsert).mockResolvedValue({
      id: "g_1",
      name: "Alex",
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      retellConfig: { id: "retell_1" },
      services: [],
      groomers: [{ id: "g_1", name: "Alex" }],
      breedRecommendations: [],
    } as never);

    const response = await POST(new Request("http://localhost/api/business/groomers") as never);

    expect(response.status).toBe(200);
    expect(prisma.groomer.upsert).toHaveBeenCalledWith({
      where: {
        businessId_name: {
          businessId: "biz_1",
          name: "Alex",
        },
      },
      create: {
        businessId: "biz_1",
        name: "Alex",
        specialties: ["Doodles", "Baths"],
        isActive: true,
      },
      update: {
        name: "Alex",
        specialties: ["Doodles", "Baths"],
        isActive: true,
      },
    });
    expect(syncRetellAgent).toHaveBeenCalled();
  });

  it("soft-deletes a groomer within the current business", async () => {
    const response = await DELETE(
      new Request("http://localhost/api/business/groomers?id=g_1", {
        method: "DELETE",
      }) as never
    );

    expect(response.status).toBe(200);
    expect(prisma.groomer.updateMany).toHaveBeenCalledWith({
      where: { id: "g_1", businessId: "biz_1" },
      data: { isActive: false },
    });
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
