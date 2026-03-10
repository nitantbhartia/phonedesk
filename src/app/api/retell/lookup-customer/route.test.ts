import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/customer-memory", () => ({
  lookupCustomerContext: vi.fn(),
  buildCustomerContextSummary: vi.fn(),
  deduplicatePets: vi.fn((pets) => pets),
}));

vi.mock("@/crm/withFallback", () => ({
  getCRMWithFallback: vi.fn(async () => ({
    getCustomer: vi.fn(async () => null),
  })),
}));

vi.mock("@/lib/demo-session", () => ({
  resolveBusinessFromDemo: vi.fn(async () => null),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import {
  buildCustomerContextSummary,
  lookupCustomerContext,
} from "@/lib/customer-memory";

describe("POST /api/retell/lookup-customer", () => {
  beforeEach(() => {
    vi.mocked(prisma.phoneNumber.findFirst).mockReset();
    vi.mocked(lookupCustomerContext).mockReset();
    vi.mocked(buildCustomerContextSummary).mockReset();
  });

  it("returns found=false when business cannot be resolved", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);

    const req = {
      json: async () => ({
        args: { caller_phone: "+16195550100" },
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }),
    } as unknown as Request;

    const response = await POST(req as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.found).toBe(false);
    expect(payload.result).toContain("Customer context is unavailable");
  });

  it("returns customer context payload for a known caller", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: { id: "biz_1" },
    } as never);
    vi.mocked(lookupCustomerContext).mockResolvedValue({
      found: true,
      normalizedPhone: "+16195550100",
      customer: {
        name: "Sarah",
        visitCount: 8,
        lastServiceName: "Full Groom",
        lastVisitAt: new Date("2026-02-12T10:00:00.000Z"),
      },
      pets: [
        { name: "Buddy", breed: "Golden Retriever", size: "LARGE", notes: null },
      ],
    } as never);
    vi.mocked(buildCustomerContextSummary).mockReturnValue(
      "Returning customer found."
    );

    const req = {
      json: async () => ({
        args: { caller_phone: "+16195550100" },
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }),
    } as unknown as Request;

    const response = await POST(req as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.found).toBe(true);
    expect(payload.customer_name).toBe("Sarah");
    expect(payload.pets).toHaveLength(1);
    expect(payload.result).toBe("Returning customer found.");
  });
});
