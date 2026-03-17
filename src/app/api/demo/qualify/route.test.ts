import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demoLead: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    demoMagicToken: {
      updateMany: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/disposable-domains", () => ({
  isValidBusinessEmail: vi.fn(),
}));

vi.mock("@/lib/email", () => ({
  sendDemoMagicLink: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { isValidBusinessEmail } from "@/lib/disposable-domains";
import { sendDemoMagicLink } from "@/lib/email";
import { POST } from "./route";

describe("POST /api/demo/qualify", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    vi.mocked(prisma.demoLead.upsert).mockReset();
    vi.mocked(prisma.demoLead.findFirst).mockReset();
    vi.mocked(prisma.demoMagicToken.updateMany).mockReset();
    vi.mocked(prisma.demoMagicToken.create).mockReset();
    vi.mocked(isValidBusinessEmail).mockReset();
    vi.mocked(sendDemoMagicLink).mockReset();
    vi.mocked(isValidBusinessEmail).mockReturnValue(true);
    vi.mocked(prisma.demoLead.findFirst).mockResolvedValue(null);
  });

  it("rejects invalid business emails", async () => {
    vi.mocked(isValidBusinessEmail).mockReturnValue(false);

    const response = await POST(new Request("http://localhost/api/demo/qualify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "test@mailinator.com" }),
    }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "invalid_email",
      message: "Please use a valid business email address.",
    });
  });

  it("blocks verified leads that are still in cooldown", async () => {
    const cooldownUntil = new Date("2026-03-15T18:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T18:00:00.000Z"));
    vi.mocked(prisma.demoLead.upsert).mockResolvedValue({
      id: "lead_1",
      verifiedAt: new Date("2026-03-10T18:00:00.000Z"),
      cooldownUntil,
    } as never);

    const response = await POST(new Request("http://localhost/api/demo/qualify", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: "owner@pawhouse.com" }),
    }) as never);

    expect(response.status).toBe(429);
    expect((await response.json()).cooldownUntil).toBe(cooldownUntil.toISOString());
  });

  it("issues a new magic token and emails the link", async () => {
    vi.mocked(prisma.demoLead.upsert).mockResolvedValue({
      id: "lead_1",
      verifiedAt: null,
      cooldownUntil: null,
    } as never);
    vi.mocked(prisma.demoMagicToken.updateMany).mockResolvedValue({ count: 0 } as never);
    vi.mocked(prisma.demoMagicToken.create).mockResolvedValue({
      token: "magic_123",
    } as never);
    vi.mocked(sendDemoMagicLink).mockResolvedValue(undefined);

    const response = await POST(new Request("http://localhost/api/demo/qualify", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-forwarded-for": "203.0.113.10",
      },
      body: JSON.stringify({ email: "owner@pawhouse.com", businessName: "Paw House" }),
    }) as never);

    expect(prisma.demoLead.upsert).toHaveBeenCalledWith({
      where: { email: "owner@pawhouse.com" },
      create: {
        email: "owner@pawhouse.com",
        businessName: "Paw House",
        ipAtCreation: "203.0.113.10",
      },
      update: { businessName: "Paw House" },
    });
    expect(sendDemoMagicLink).toHaveBeenCalledWith({
      to: "owner@pawhouse.com",
      magicLink: "https://app.example.com/api/demo/verify/magic_123",
      businessName: "Paw House",
    });
    await expect(response.json()).resolves.toEqual({ sent: true });
  });
});
