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
    rebookingConfig: {
      findUnique: vi.fn(),
      create: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "./route";

describe("/api/rebooking/config", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.rebookingConfig.findUnique).mockReset();
    vi.mocked(prisma.rebookingConfig.create).mockReset();
    vi.mocked(prisma.rebookingConfig.upsert).mockReset();
  });

  it("creates default config on first GET", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({ id: "biz_1" } as never);
    vi.mocked(prisma.rebookingConfig.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.rebookingConfig.create).mockResolvedValue({ id: "cfg_1", enabled: true } as never);

    const response = await GET();

    expect(prisma.rebookingConfig.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz_1",
        enabled: true,
        defaultInterval: 42,
        reminderDaysBefore: 7,
      },
    });
    await expect(response.json()).resolves.toEqual({ config: { id: "cfg_1", enabled: true } });
  });

  it("upserts provided values on POST", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({ id: "biz_1" } as never);
    vi.mocked(prisma.rebookingConfig.upsert).mockResolvedValue({ id: "cfg_1" } as never);

    const response = await POST(
      new Request("http://localhost/api/rebooking/config", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ enabled: false, defaultInterval: 56 }),
      }) as never
    );

    expect(prisma.rebookingConfig.upsert).toHaveBeenCalledWith({
      where: { businessId: "biz_1" },
      create: {
        businessId: "biz_1",
        enabled: false,
        defaultInterval: 56,
        reminderDaysBefore: 7,
      },
      update: {
        enabled: false,
        defaultInterval: 56,
      },
    });
    await expect(response.json()).resolves.toEqual({ config: { id: "cfg_1" } });
  });
});
