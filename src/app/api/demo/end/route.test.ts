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
    demoSession: {
      deleteMany: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

describe("POST /api/demo/end", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.demoSession.deleteMany).mockReset();
  });

  it("requires auth", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(401);
  });

  it("deletes active demo sessions for the user's business", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "owner@example.com" } } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      business: { id: "biz_1" },
    } as never);
    vi.mocked(prisma.demoSession.deleteMany).mockResolvedValue({ count: 1 } as never);

    const response = await POST();

    expect(prisma.demoSession.deleteMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1" },
    });
    await expect(response.json()).resolves.toEqual({ ok: true });
  });
});
