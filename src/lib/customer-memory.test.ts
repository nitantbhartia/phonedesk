import { describe, expect, it } from "vitest";
import { buildCustomerContextSummary } from "./customer-memory";

describe("buildCustomerContextSummary", () => {
  it("returns new-customer guidance when no customer exists", () => {
    const summary = buildCustomerContextSummary({
      found: false,
      normalizedPhone: "+16195550100",
      customer: null,
      pets: [],
      behaviorLogs: [],
    });

    expect(summary).toContain("No prior customer record found");
  });

  it("returns detailed returning-customer context", () => {
    const summary = buildCustomerContextSummary({
      found: true,
      normalizedPhone: "+16195550100",
      customer: {
        id: "cust_1",
        businessId: "biz_1",
        phone: "+16195550100",
        name: "Sarah",
        visitCount: 8,
        vipFlag: false,
        notes: "Dog gets anxious during nail trims",
        lastServiceName: "Full Groom",
        lastVisitAt: new Date("2026-02-12T10:00:00.000Z"),
        lastContactAt: new Date("2026-03-01T18:00:00.000Z"),
        lastCallSummary: "Asked about next availability",
        lastOutcome: "NO_BOOKING",
        noShowCount: 0,
        preferredGroomerId: null,
        preferredGroomer: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        pets: [],
      },
      pets: [
        {
          id: "pet_1",
          customerId: "cust_1",
          name: "Buddy",
          breed: "Golden Retriever",
          size: "LARGE",
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      behaviorLogs: [],
    });

    expect(summary).toContain("Returning customer found.");
    expect(summary).toContain("Customer name: Sarah.");
    expect(summary).toContain("Pets on file: Buddy, Golden Retriever, LARGE.");
    expect(summary).toContain("Last service: Full Groom.");
  });
});

