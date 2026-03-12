import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/retell", () => ({
  syncRetellAgent: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { syncRetellAgent } from "@/lib/retell";
import { POST } from "./route";

describe("POST /api/admin/sync-agents", () => {
  const originalSecret = process.env.ADMIN_SECRET;

  beforeEach(() => {
    process.env.ADMIN_SECRET = "secret";
    vi.mocked(prisma.business.findMany).mockReset();
    vi.mocked(syncRetellAgent).mockReset();
  });

  afterEach(() => {
    process.env.ADMIN_SECRET = originalSecret;
  });

  it("requires the admin bearer token", async () => {
    const response = await POST(new Request("http://localhost/api/admin/sync-agents") as never);

    expect(response.status).toBe(401);
  });

  it("returns a no-op response when no configured businesses are found", async () => {
    vi.mocked(prisma.business.findMany).mockResolvedValue([] as never);

    const response = await POST(new Request("http://localhost/api/admin/sync-agents", {
      method: "POST",
      headers: { authorization: "Bearer secret" },
    }) as never);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      synced: 0,
      message: "No businesses with Retell config found.",
    });
  });

  it("returns 207 when some syncs fail", async () => {
    vi.mocked(prisma.business.findMany).mockResolvedValue([
      { id: "biz_1", name: "Paw House" },
      { id: "biz_2", name: "Ring Paw" },
    ] as never);
    vi.mocked(syncRetellAgent)
      .mockResolvedValueOnce({ agentId: "agent_1" } as never)
      .mockRejectedValueOnce(new Error("retell down"));

    const response = await POST(new Request("http://localhost/api/admin/sync-agents", {
      method: "POST",
      headers: { authorization: "Bearer secret", "content-type": "application/json" },
      body: JSON.stringify({ businessId: "biz_1" }),
    }) as never);
    const payload = await response.json();

    expect(response.status).toBe(207);
    expect(payload.ok).toBe(false);
    expect(payload.synced).toBe(1);
    expect(payload.failed).toBe(1);
  });
});
