import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: vi.fn(),
    publicDemoAttempt: {
      findFirst: vi.fn(),
      count: vi.fn(),
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
  DEMO_CALL_DURATION_MS: 120000,
  updateRetellPhoneNumber: vi.fn(),
  updateRetellAgent: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/demo-session", () => ({
  cleanupIdleDemoNumbers: vi.fn().mockResolvedValue(undefined),
}));

import { prisma } from "@/lib/prisma";
import { updateRetellAgent, updateRetellPhoneNumber } from "@/lib/retell";
import { cleanupIdleDemoNumbers } from "@/lib/demo-session";
import { POST } from "./route";

describe("POST /api/demo/public/start", () => {
  beforeEach(() => {
    process.env.DEMO_BUSINESS_ID = "demo_biz";
    vi.mocked(prisma.$transaction).mockReset();
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockReset();
    vi.mocked(prisma.publicDemoAttempt.count).mockReset();
    vi.mocked(prisma.publicDemoAttempt.findMany).mockReset();
    vi.mocked(prisma.publicDemoAttempt.create).mockReset();
    vi.mocked(prisma.publicDemoAttempt.count).mockResolvedValue(0);
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.demoNumber.findFirst).mockReset();
    vi.mocked(updateRetellPhoneNumber).mockReset();
    vi.mocked(updateRetellPhoneNumber).mockResolvedValue(undefined as never);
    vi.mocked(updateRetellAgent).mockReset();
    vi.mocked(updateRetellAgent).mockResolvedValue(undefined);
    vi.mocked(cleanupIdleDemoNumbers).mockReset();
    vi.mocked(cleanupIdleDemoNumbers).mockResolvedValue(undefined);
  });

  it("does not reuse a demo number that is already assigned to an active public attempt", async () => {
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.publicDemoAttempt.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      retellConfig: { agentId: "agent_1" },
    } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        publicDemoAttempt: {
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
        body: JSON.stringify({}),
      }) as never
    );

    expect(response.status).toBe(200);
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it("returns an existing active session idempotently", async () => {
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
        body: JSON.stringify({}),
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

  it("blocks IPs that have had too many recent attempts", async () => {
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.publicDemoAttempt.count).mockResolvedValue(3);

    const response = await POST(
      new Request("http://localhost/api/demo/public/start", {
        method: "POST",
        body: JSON.stringify({}),
      }) as never
    );

    expect(response.status).toBe(429);
    const body = await response.json() as { error: string };
    expect(body.error).toBe("cooldown_active");
  });

  it("auto-reclaims an idle demo number when all lines are busy", async () => {
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.publicDemoAttempt.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      retellConfig: { agentId: "agent_1" },
    } as never);
    vi.mocked(updateRetellPhoneNumber).mockResolvedValue(undefined as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        publicDemoAttempt: {
          findFirst: vi.fn()
            // First call: no existing session for this IP
            .mockResolvedValueOnce(null)
            // Second call: find the stale attempt to reclaim
            .mockResolvedValueOnce({
              id: "stale_attempt",
              demoNumberId: "demo_num_1",
              startedAt: new Date("2026-03-17T06:00:00.000Z"),
              callerPhone: "+16195550100",
              demoNumber: {
                id: "demo_num_1",
                number: "+17165763523",
                retellPhoneNumber: "retell_demo_1",
              },
            }),
          findMany: vi.fn().mockResolvedValue([
            { demoNumberId: "demo_num_1" },
            { demoNumberId: "demo_num_2" },
          ]),
          create: vi.fn().mockResolvedValue({
            sessionToken: "new_token",
            startedAt: new Date("2026-03-17T07:00:00.000Z"),
          }),
          update: vi.fn().mockResolvedValue({}),
        },
        demoNumber: {
          // No available number on first check
          findFirst: vi.fn().mockResolvedValue(null),
        },
        call: {
          // No active call for the stale session
          findFirst: vi.fn().mockResolvedValue(null),
        },
      };
      return callback(tx as never);
    });

    const response = await POST(
      new Request("http://localhost/api/demo/public/start", {
        method: "POST",
        body: JSON.stringify({}),
      }) as never
    );

    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.number).toBe("+17165763523");
  });

  it("does NOT reclaim a demo number with an active in-progress call", async () => {
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.publicDemoAttempt.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      retellConfig: { agentId: "agent_1" },
    } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (callback) => {
      const tx = {
        publicDemoAttempt: {
          findFirst: vi.fn()
            .mockResolvedValueOnce(null)
            .mockResolvedValueOnce({
              id: "active_attempt",
              demoNumberId: "demo_num_1",
              startedAt: new Date("2026-03-17T06:50:00.000Z"),
              callerPhone: "+16195550100",
              demoNumber: {
                id: "demo_num_1",
                number: "+17165763523",
                retellPhoneNumber: "retell_demo_1",
              },
            }),
          findMany: vi.fn().mockResolvedValue([
            { demoNumberId: "demo_num_1" },
          ]),
          create: vi.fn(),
          update: vi.fn(),
        },
        demoNumber: {
          findFirst: vi.fn().mockResolvedValue(null),
        },
        call: {
          // Active call exists — should NOT reclaim
          findFirst: vi.fn().mockResolvedValue({
            id: "active_call",
            status: "IN_PROGRESS",
          }),
        },
      };
      return callback(tx as never);
    });

    const response = await POST(
      new Request("http://localhost/api/demo/public/start", {
        method: "POST",
        body: JSON.stringify({}),
      }) as never
    );

    expect(response.status).toBe(503);
    const body = await response.json();
    expect(body.error).toBe("demo_unavailable");
  });

  it("returns 503 when there is no configured demo business agent", async () => {
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.publicDemoAttempt.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      retellConfig: null,
    } as never);

    const response = await POST(
      new Request("http://localhost/api/demo/public/start", {
        method: "POST",
        body: JSON.stringify({}),
      }) as never
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      error: "demo_not_ready",
      message: "Demo agent is not configured yet.",
    });
  });
});
