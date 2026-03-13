import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pricingRule: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
    },
    service: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/route-helpers", () => ({
  requireCurrentBusiness: vi.fn(),
  parseJsonBody: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { parseJsonBody, requireCurrentBusiness } from "@/lib/route-helpers";
import { DELETE, GET, POST } from "./route";

describe("pricing route", () => {
  beforeEach(() => {
    vi.mocked(prisma.service.findFirst).mockReset();
    vi.mocked(prisma.pricingRule.findMany).mockReset();
    vi.mocked(prisma.pricingRule.findFirst).mockReset();
    vi.mocked(prisma.pricingRule.update).mockReset();
    vi.mocked(prisma.pricingRule.create).mockReset();
    vi.mocked(prisma.pricingRule.deleteMany).mockReset();
    vi.mocked(parseJsonBody).mockReset();
    vi.mocked(requireCurrentBusiness).mockReset();
    vi.mocked(requireCurrentBusiness).mockResolvedValue({
      business: { id: "biz_1" },
      userId: "user_1",
    } as never);
  });

  it("rejects invalid price payloads before hitting prisma", async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({
      response: Response.json(
        { error: "Price must be between $0 and $9,999" },
        { status: 400 }
      ),
    } as never);

    const response = await POST(new Request("http://localhost/api/pricing") as never);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("Price must be between");
    expect(prisma.service.findFirst).not.toHaveBeenCalled();
  });

  it("lists pricing rules for the current business", async () => {
    vi.mocked(prisma.pricingRule.findMany).mockResolvedValue([
      { id: "rule_1" },
    ] as never);

    const response = await GET();

    expect(response.status).toBe(200);
    expect(prisma.pricingRule.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1" },
      include: {
        service: {
          select: { id: true, name: true, price: true },
        },
      },
      orderBy: [{ service: { name: "asc" } }, { breed: "asc" }, { size: "asc" }],
    });
    await expect(response.json()).resolves.toEqual({
      pricingRules: [{ id: "rule_1" }],
    });
  });

  it("updates an existing pricing rule instead of creating a duplicate", async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({
      data: {
        serviceId: "svc_1",
        breed: "Poodle",
        size: "SMALL",
        price: 95,
        notes: "Hand scissor finish",
      },
    } as never);
    vi.mocked(prisma.service.findFirst).mockResolvedValue({
      id: "svc_1",
    } as never);
    vi.mocked(prisma.pricingRule.findFirst)
      .mockResolvedValueOnce({ id: "rule_1" } as never);
    vi.mocked(prisma.pricingRule.update).mockResolvedValue({
      id: "rule_1",
    } as never);

    const response = await POST(new Request("http://localhost/api/pricing") as never);

    expect(response.status).toBe(200);
    expect(prisma.pricingRule.update).toHaveBeenCalledWith({
      where: { id: "rule_1" },
      data: {
        price: 95,
        notes: "Hand scissor finish",
        isActive: true,
      },
      include: {
        service: {
          select: { id: true, name: true, price: true },
        },
      },
    });
    expect(prisma.pricingRule.create).not.toHaveBeenCalled();
  });

  it("creates a new pricing rule when none exists", async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({
      data: {
        serviceId: "svc_1",
        breed: null,
        size: null,
        price: 80,
        notes: null,
      },
    } as never);
    vi.mocked(prisma.service.findFirst).mockResolvedValue({
      id: "svc_1",
    } as never);
    vi.mocked(prisma.pricingRule.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.pricingRule.create).mockResolvedValue({
      id: "rule_new",
    } as never);

    const response = await POST(new Request("http://localhost/api/pricing") as never);

    expect(response.status).toBe(200);
    expect(prisma.pricingRule.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz_1",
        serviceId: "svc_1",
        breed: null,
        size: null,
        price: 80,
        notes: null,
      },
      include: {
        service: {
          select: { id: true, name: true, price: true },
        },
      },
    });
  });

  it("returns 404 when deleting a rule outside the business", async () => {
    vi.mocked(prisma.pricingRule.findFirst).mockResolvedValue(null);

    const response = await DELETE(
      new Request("http://localhost/api/pricing?id=missing", {
        method: "DELETE",
      }) as never
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Pricing rule not found",
    });
    expect(prisma.pricingRule.deleteMany).not.toHaveBeenCalled();
  });
});
