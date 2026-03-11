import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    publicDemoAttempt: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
    demoNumber: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/retell", () => ({
  DEMO_CALL_DURATION_MS: 240000,
  updateRetellPhoneNumber: vi.fn(),
  updateRetellAgent: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/prisma";
import { POST } from "./route";

describe("POST /api/demo/public/start", () => {
  beforeEach(() => {
    process.env.DEMO_BUSINESS_ID = "demo_biz";
    vi.mocked(prisma.$transaction).mockReset();
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockReset();
    vi.mocked(prisma.publicDemoAttempt.findMany).mockReset();
    vi.mocked(prisma.publicDemoAttempt.create).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.demoNumber.findFirst).mockReset();
  });

  it("does not reuse a demo number that is already assigned to an active public attempt", async () => {
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      retellConfig: { agentId: "agent_1" },
    } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        publicDemoAttempt: {
          findMany: vi.fn().mockResolvedValue([{ demoNumberId: "demo_num_1" }]),
          create: vi.fn().mockResolvedValue({
            sessionToken: "token_1",
            startedAt: new Date("2026-03-11T20:00:00.000Z"),
          }),
        },
        demoNumber: {
          findFirst: vi.fn().mockResolvedValue({
            id: "demo_num_2",
            number: "+16195550101",
            retellPhoneNumber: "+16195550101",
          }),
        },
      };
      return callback(tx as never);
    });

    const response = await POST(
      new Request("http://localhost/api/demo/public/start", { method: "POST" }) as never
    );

    expect(response.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});
