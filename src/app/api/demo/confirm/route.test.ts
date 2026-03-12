import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demoMagicToken: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    demoLead: {
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/demo-token", () => ({
  issueDemoToken: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { issueDemoToken } from "@/lib/demo-token";
import { POST } from "./route";

describe("POST /api/demo/confirm", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T18:00:00.000Z"));
    vi.mocked(prisma.demoMagicToken.findUnique).mockReset();
    vi.mocked(prisma.demoMagicToken.update).mockReset();
    vi.mocked(prisma.demoLead.update).mockReset();
    vi.mocked(prisma.$transaction).mockReset();
    vi.mocked(issueDemoToken).mockReset();
    vi.mocked(issueDemoToken).mockReturnValue("ldt_123");
    vi.mocked(prisma.$transaction).mockResolvedValue([] as never);
  });

  it("rejects missing tokens", async () => {
    const response = await POST(new Request("http://localhost/api/demo/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({}),
    }) as never);

    expect(response.status).toBe(400);
  });

  it("consumes the token and returns a live demo token", async () => {
    vi.mocked(prisma.demoMagicToken.findUnique).mockResolvedValue({
      id: "magic_1",
      token: "magic_123",
      leadId: "lead_1",
      usedAt: null,
      expiresAt: new Date("2026-03-12T19:00:00.000Z"),
      lead: { verifiedAt: null },
    } as never);

    const response = await POST(new Request("http://localhost/api/demo/confirm", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token: "magic_123" }),
    }) as never);

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(issueDemoToken).toHaveBeenCalledWith("lead_1");
    await expect(response.json()).resolves.toEqual({ ldt: "ldt_123" });
  });
});
