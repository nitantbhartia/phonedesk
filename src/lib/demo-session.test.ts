import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demoSession: {
      findFirst: vi.fn(),
    },
    demoNumber: {
      findUnique: vi.fn(),
    },
    publicDemoAttempt: {
      findFirst: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { resolveBusinessFromDemo } from "./demo-session";

describe("resolveBusinessFromDemo", () => {
  beforeEach(() => {
    process.env.DEMO_BUSINESS_ID = "demo_biz";
    vi.mocked(prisma.demoSession.findFirst).mockReset();
    vi.mocked(prisma.demoNumber.findUnique).mockReset();
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockReset();
  });

  it("returns the private demo session business when present", async () => {
    vi.mocked(prisma.demoSession.findFirst).mockResolvedValue({
      businessId: "biz_123",
    } as never);

    await expect(resolveBusinessFromDemo("+16195550100")).resolves.toBe("biz_123");
    expect(prisma.demoNumber.findUnique).not.toHaveBeenCalled();
  });

  it("falls back to the public demo business for an active public attempt", async () => {
    vi.mocked(prisma.demoSession.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.demoNumber.findUnique).mockResolvedValue({
      id: "demo_num_1",
    } as never);
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockResolvedValue({
      id: "attempt_1",
    } as never);

    await expect(resolveBusinessFromDemo("+16195550100")).resolves.toBe("demo_biz");
  });
});
