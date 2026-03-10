import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: {
      findFirst: vi.fn(),
    },
    service: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/retell-auth", () => ({
  isRetellWebhookValid: vi.fn(),
}));

vi.mock("@/crm/withFallback", () => ({
  getCRMWithFallback: vi.fn(),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { getCRMWithFallback } from "@/crm/withFallback";

function makeRequest(body: unknown, signature = "sig") {
  return new Request("http://localhost/api/retell/get-services", {
    method: "POST",
    headers: { "content-type": "application/json", "x-retell-signature": signature },
    body: JSON.stringify(body),
  });
}

describe("POST /api/retell/get-services", () => {
  beforeEach(() => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(true);
    vi.mocked(prisma.phoneNumber.findFirst).mockReset();
    vi.mocked(prisma.service.findMany).mockReset();
    vi.mocked(getCRMWithFallback).mockReset();
  });

  it("rejects unauthorized requests", async () => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(false);

    const response = await POST(makeRequest({ call: { to_number: "+16195559999" } }) as never);

    expect(response.status).toBe(401);
  });

  it("returns CRM services when available", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: { id: "biz_1" },
    } as never);
    vi.mocked(getCRMWithFallback).mockResolvedValue({
      getServices: vi.fn(async () => [
        { name: "Full Groom", priceCents: 9500, durationMinutes: 90 },
      ]),
    } as never);

    const response = await POST(makeRequest({ call: { to_number: "+16195559999" } }) as never);
    const payload = await response.json();

    expect(payload.services).toEqual([
      {
        name: "Full Groom",
        price: 95,
        price_cents: 9500,
        duration_minutes: 90,
      },
    ]);
    expect(payload.result).toContain("Full Groom $95");
    expect(prisma.service.findMany).not.toHaveBeenCalled();
  });

  it("falls back to database services when CRM lookup fails", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: { id: "biz_1" },
    } as never);
    vi.mocked(getCRMWithFallback).mockResolvedValue({
      getServices: vi.fn(async () => {
        throw new Error("crm unavailable");
      }),
    } as never);
    vi.mocked(prisma.service.findMany).mockResolvedValue([
      { name: "Bath", price: 45, duration: 60 },
    ] as never);

    const response = await POST(makeRequest({ call: { to_number: "+16195559999" } }) as never);
    const payload = await response.json();

    expect(prisma.service.findMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1", isActive: true },
      orderBy: { name: "asc" },
    });
    expect(payload.services[0]).toEqual({
      name: "Bath",
      price: 45,
      price_cents: 4500,
      duration_minutes: 60,
    });
  });

  it("returns an empty response when no services are configured", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: { id: "biz_1" },
    } as never);
    vi.mocked(getCRMWithFallback).mockResolvedValue({
      getServices: vi.fn(async () => []),
    } as never);
    vi.mocked(prisma.service.findMany).mockResolvedValue([]);

    const response = await POST(makeRequest({ call: { to_number: "+16195559999" } }) as never);
    const payload = await response.json();

    expect(payload.result).toBe("No services configured.");
    expect(payload.services).toEqual([]);
  });
});
