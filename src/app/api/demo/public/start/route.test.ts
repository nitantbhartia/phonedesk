import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    publicDemoAttempt: {
      findFirst: vi.fn(),
      count: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      count: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
    demoLead: {
      findUnique: vi.fn(),
      update: vi.fn(),
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

vi.mock("@/lib/demo-token", () => ({
  verifyDemoToken: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { verifyDemoToken } from "@/lib/demo-token";
import { updateRetellAgent, updateRetellPhoneNumber } from "@/lib/retell";
import { POST } from "./route";

describe("POST /api/demo/public/start", () => {
  beforeEach(() => {
    process.env.DEMO_BUSINESS_ID = "demo_biz";
    vi.mocked(prisma.$transaction).mockReset();
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockReset();
    vi.mocked(prisma.publicDemoAttempt.count).mockReset();
    vi.mocked(prisma.publicDemoAttempt.findMany).mockReset();
    vi.mocked(prisma.publicDemoAttempt.create).mockReset();
    vi.mocked(prisma.publicDemoAttempt.count).mockReset();
    // Default: no recent attempts (allow through)
    vi.mocked(prisma.publicDemoAttempt.count).mockResolvedValue(0);
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.demoLead.findUnique).mockReset();
    vi.mocked(prisma.demoLead.update).mockReset();
    vi.mocked(prisma.demoNumber.findFirst).mockReset();
    vi.mocked(verifyDemoToken).mockReset();
    vi.mocked(updateRetellPhoneNumber).mockReset();
    vi.mocked(updateRetellAgent).mockReset();
    vi.mocked(updateRetellAgent).mockResolvedValue(undefined);
  });

  it("does not reuse a demo number that is already assigned to an active public attempt", async () => {
    vi.mocked(verifyDemoToken).mockReturnValue({ leadId: "lead_1" } as never);
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockResolvedValueOnce(null).mockResolvedValueOnce(null);
    vi.mocked(prisma.publicDemoAttempt.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      retellConfig: { agentId: "agent_1" },
    } as never);
    vi.mocked(prisma.demoLead.findUnique).mockResolvedValue({
      id: "lead_1",
      verifiedAt: new Date("2026-03-11T19:00:00.000Z"),
      cooldownUntil: null,
    } as never);
    vi.mocked(prisma.demoLead.update).mockResolvedValue({ id: "lead_1" } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        publicDemoAttempt: {
          // No existing in-tx session
          findFirst: vi.fn().mockResolvedValue(null),
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
      new Request("http://localhost/api/demo/public/start", {
        method: "POST",
        body: JSON.stringify({ ldt: "token_1" }),
      }) as never
    );

    expect(response.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("requires email verification before starting the demo", async () => {
    const response = await POST(
      new Request("http://localhost/api/demo/public/start", {
        method: "POST",
        body: JSON.stringify({}),
      }) as never
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({
      error: "verification_required",
      message: "Please verify your email to access the live demo.",
    });
  });

  it("returns an existing active session idempotently", async () => {
    vi.mocked(verifyDemoToken).mockReturnValue({ leadId: "lead_1" } as never);
    vi.mocked(prisma.demoLead.findUnique).mockResolvedValue({
      id: "lead_1",
      verifiedAt: new Date("2026-03-11T19:00:00.000Z"),
      cooldownUntil: null,
    } as never);
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockResolvedValue({
      sessionToken: "existing_token",
      startedAt: new Date("2026-03-11T20:00:00.000Z"),
      demoNumberId: "demo_num_1",
    } as never);
    vi.mocked(prisma.demoNumber.findUnique).mockResolvedValue({
      number: "+16195550101",
    } as never);

    const response = await POST(
      new Request("http://localhost/api/demo/public/start", {
        method: "POST",
        body: JSON.stringify({ ldt: "token_1" }),
      }) as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      sessionToken: "existing_token",
      number: "+16195550101",
      startedAt: "2026-03-11T20:00:00.000Z",
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("returns cooldown information for recently used leads", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));
    vi.mocked(verifyDemoToken).mockReturnValue({ leadId: "lead_1" } as never);
    vi.mocked(prisma.demoLead.findUnique).mockResolvedValue({
      id: "lead_1",
      verifiedAt: new Date("2026-03-11T19:00:00.000Z"),
      cooldownUntil: new Date("2026-03-14T12:00:00.000Z"),
    } as never);

    const response = await POST(
      new Request("http://localhost/api/demo/public/start", {
        method: "POST",
        body: JSON.stringify({ ldt: "token_1" }),
      }) as never
    );

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({
      error: "cooldown_active",
      message: "You've already tried the live demo recently. Come back in 2 days — no hard feelings.",
      cooldownUntil: "2026-03-14T12:00:00.000Z",
    });
    vi.useRealTimers();
  });

  it("blocks a lead who has had 2+ attempts in the last 3 days", async () => {
    vi.mocked(verifyDemoToken).mockReturnValue({ leadId: "lead_1" } as never);
    vi.mocked(prisma.demoLead.findUnique).mockResolvedValue({
      id: "lead_1",
      verifiedAt: new Date("2026-03-11T19:00:00.000Z"),
      cooldownUntil: null,
    } as never);
    // No active session
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockResolvedValue(null);
    // 2 recent attempts — exceeds the limit
    vi.mocked(prisma.publicDemoAttempt.count).mockResolvedValue(2);

    const response = await POST(
      new Request("http://localhost/api/demo/public/start", {
        method: "POST",
        body: JSON.stringify({ ldt: "token_1" }),
      }) as never
    );

    expect(response.status).toBe(429);
    const body = await response.json() as { error: string; message: string };
    expect(body.error).toBe("cooldown_active");
    expect(body.message).toContain("3 days");
  });

  it("returns 503 when there is no configured demo business agent", async () => {
    vi.mocked(verifyDemoToken).mockReturnValue({ leadId: "lead_1" } as never);
    vi.mocked(prisma.demoLead.findUnique).mockResolvedValue({
      id: "lead_1",
      verifiedAt: new Date("2026-03-11T19:00:00.000Z"),
      cooldownUntil: null,
    } as never);
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.publicDemoAttempt.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      retellConfig: null,
    } as never);

    const response = await POST(
      new Request("http://localhost/api/demo/public/start", {
        method: "POST",
        body: JSON.stringify({ ldt: "token_1" }),
      }) as never
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "demo_not_ready",
      message: "Demo agent is not configured yet.",
    });
  });
});
