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
    pricingRule: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
    },
    service: {
      findFirst: vi.fn(),
    },
    user: {
      upsert: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

describe("pricing route", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.service.findFirst).mockReset();
    vi.mocked(prisma.pricingRule.upsert).mockReset();
  });

  it("rejects invalid price payloads before hitting prisma", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);

    const response = await POST(
      new Request("http://localhost/api/pricing", {
        method: "POST",
        body: JSON.stringify({
          serviceId: "svc_1",
          price: -5,
        }),
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Price must be between");
    expect(prisma.service.findFirst).not.toHaveBeenCalled();
  });
});
