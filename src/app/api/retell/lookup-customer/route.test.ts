import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: {
      findFirst: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
    appointment: {
      findFirst: vi.fn().mockResolvedValue(null),
    },
    rebookingConfig: {
      findUnique: vi.fn().mockResolvedValue(null),
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
  resolveDemoSession: vi.fn(async () => null),
}));

vi.mock("@/lib/retell-auth", () => ({
  isRetellWebhookValid: vi.fn(() => true),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import {
  buildCustomerContextSummary,
  lookupCustomerContext,
} from "@/lib/customer-memory";
import { resolveDemoSession } from "@/lib/demo-session";

function makeRequest(body: unknown, signature = "sig") {
  return new Request("http://localhost/api/retell/lookup-customer", {
    method: "POST",
    headers: { "content-type": "application/json", "x-retell-signature": signature },
    body: JSON.stringify(body),
  });
}

describe("POST /api/retell/lookup-customer", () => {
  beforeEach(() => {
    vi.mocked(prisma.phoneNumber.findFirst).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(lookupCustomerContext).mockReset();
    vi.mocked(buildCustomerContextSummary).mockReset();
    vi.mocked(resolveDemoSession).mockReset();
  });

  it("returns found=false when business cannot be resolved", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);

    const response = await POST(
      makeRequest({
        args: { caller_phone: "+16195550100" },
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.found).toBe(false);
    expect(payload.result).toContain("Customer context is unavailable");
  });

  it("returns customer context payload for a known caller", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: { id: "biz_1", timezone: "America/Los_Angeles" },
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
      behaviorLogs: [],
    } as never);
    vi.mocked(buildCustomerContextSummary).mockReturnValue(
      "Returning customer found."
    );

    const response = await POST(
      makeRequest({
        args: { caller_phone: "+16195550100" },
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.found).toBe(true);
    expect(payload.customer_name).toBe("Sarah");
    expect(payload.pets).toHaveLength(1);
    expect(payload.result).toBe("Returning customer found.");
  });

  it("suppresses returning-customer memory for demo calls", async () => {
    vi.mocked(resolveDemoSession).mockResolvedValue({
      businessId: "demo_biz",
      source: "public",
      demoNumberId: "demo_num_1",
      publicAttemptId: "attempt_1",
      leadId: "lead_1",
      callerPhone: null,
    });
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "demo_biz",
      timezone: "America/Los_Angeles",
      onboardingComplete: true,
      isActive: true,
      stripeSubscriptionStatus: "active",
      ownerName: "Demo Owner",
    } as never);

    const response = await POST(
      makeRequest({
        args: { caller_phone: "+16195550100" },
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.found).toBe(false);
    expect(payload.result).toContain("demo call");
    expect(lookupCustomerContext).not.toHaveBeenCalled();
  });
});
