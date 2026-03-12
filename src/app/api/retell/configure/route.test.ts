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

vi.mock("@/lib/retell", () => ({
  syncRetellAgent: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { syncRetellAgent } from "@/lib/retell";
import { POST } from "./route";

describe("POST /api/retell/configure", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.user.upsert).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(syncRetellAgent).mockReset();
  });

  it("returns 401 without a resolved user id", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await POST();

    expect(response.status).toBe(401);
  });

  it("syncs the retell agent for the current business", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      services: [],
      retellConfig: null,
      breedRecommendations: [],
    } as never);
    vi.mocked(syncRetellAgent).mockResolvedValue({ agentId: "agent_1" } as never);

    const response = await POST();

    expect(syncRetellAgent).toHaveBeenCalledWith(expect.objectContaining({ id: "biz_1" }));
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
