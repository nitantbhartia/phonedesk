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
    call: {
      count: vi.fn(),
    },
    demoSession: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    demoNumber: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/retell", () => ({
  syncRetellAgent: vi.fn(),
  updateRetellPhoneNumber: vi.fn(),
  updateRetellAgent: vi.fn(),
  DEMO_CALL_DURATION_MS: 240000,
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import {
  syncRetellAgent,
  updateRetellAgent,
  updateRetellPhoneNumber,
} from "@/lib/retell";
import { POST } from "./route";

describe("POST /api/demo/start", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T18:00:00.000Z"));
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.call.count).mockReset();
    vi.mocked(prisma.demoSession.findUnique).mockReset();
    vi.mocked(prisma.demoSession.upsert).mockReset();
    vi.mocked(prisma.demoNumber.findFirst).mockReset();
    vi.mocked(syncRetellAgent).mockReset();
    vi.mocked(updateRetellPhoneNumber).mockReset();
    vi.mocked(updateRetellAgent).mockReset();
    vi.mocked(updateRetellAgent).mockResolvedValue(undefined);
  });

  it("requires auth", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await POST(new Request("http://localhost/api/demo/start") as never);

    expect(response.status).toBe(401);
  });

  it("returns the active demo session if one already exists", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "owner@example.com" } } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      business: { id: "biz_1", retellConfig: { agentId: "agent_1" } },
    } as never);
    vi.mocked(prisma.call.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.demoSession.findUnique).mockResolvedValue({
      expiresAt: new Date("2026-03-12T18:10:00.000Z"),
      demoNumber: { number: "+16195559999" },
    } as never);

    const response = await POST(new Request("http://localhost/api/demo/start") as never);

    await expect(response.json()).resolves.toEqual({ demoNumber: "+16195559999" });
    expect(prisma.demoNumber.findFirst).not.toHaveBeenCalled();
  });

  it("provisions a demo number and refreshes the session when needed", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "owner@example.com" } } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      business: {
        id: "biz_1",
        services: [],
        retellConfig: { agentId: "agent_1" },
        breedRecommendations: [],
        groomers: [],
      },
    } as never);
    vi.mocked(prisma.call.count).mockResolvedValue(0 as never);
    vi.mocked(prisma.demoSession.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.demoNumber.findFirst).mockResolvedValue({
      id: "demo_1",
      number: "+16195559999",
      retellPhoneNumber: "retell_demo_1",
    } as never);
    vi.mocked(prisma.demoSession.upsert).mockResolvedValue({ id: "session_1" } as never);

    const response = await POST(new Request("http://localhost/api/demo/start") as never);

    expect(updateRetellPhoneNumber).toHaveBeenCalledWith("retell_demo_1", {
      inboundAgentId: "agent_1",
    });
    expect(updateRetellAgent).toHaveBeenCalledWith("agent_1", { maxCallDurationMs: 240000 });
    expect(prisma.demoSession.upsert).toHaveBeenCalled();
    await expect(response.json()).resolves.toEqual({ demoNumber: "+16195559999" });
  });
});
