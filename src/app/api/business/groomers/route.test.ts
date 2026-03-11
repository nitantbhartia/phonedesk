import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/retell", () => ({
  syncRetellAgent: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    groomer: {
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

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

describe("POST /api/business/groomers", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.groomer.updateMany).mockReset();
    vi.mocked(prisma.groomer.findFirst).mockReset();
    vi.mocked(prisma.groomer.update).mockReset();
    vi.mocked(prisma.groomer.upsert).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
  });

  it("rejects updates for groomers outside the current business", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      business: { id: "biz_1" },
    } as never);
    vi.mocked(prisma.groomer.findFirst).mockResolvedValue(null);

    const req = {
      json: async () => ({
        groomers: [{ id: "groomer_foreign", name: "Alex" }],
      }),
    } as Request;

    const response = await POST(req as never);
    const payload = await response.json();

    expect(response.status).toBe(404);
    expect(payload.error).toContain("Groomer not found");
    expect(prisma.groomer.update).not.toHaveBeenCalled();
  });
});
