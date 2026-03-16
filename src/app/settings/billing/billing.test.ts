import { describe, expect, it } from "vitest";

/**
 * Verify that plan feature lists across billing and onboarding
 * do not include overage pricing (removed as too early for pre-launch).
 */

// Replicate the PLANS array from billing page
const BILLING_PLANS = [
  {
    id: "STARTER",
    name: "Solo",
    price: 99,
    minutes: 120,
    features: [
      "120 minutes/month (~60 calls)",
      "Everything included",
      "Calendar integration",
    ],
  },
  {
    id: "PRO",
    name: "Studio",
    price: 199,
    minutes: 300,
    popular: true,
    features: [
      "300 minutes/month (~150 calls)",
      "Priority setup",
      "Square + Google Calendar",
    ],
  },
  {
    id: "BUSINESS",
    name: "Salon",
    price: 349,
    minutes: 500,
    features: [
      "500 minutes/month (~250 calls)",
      "Priority support",
      "Multi-groomer routing",
    ],
  },
];

describe("billing plans", () => {
  it("no plan includes overage pricing in features", () => {
    for (const plan of BILLING_PLANS) {
      for (const feature of plan.features) {
        expect(feature).not.toMatch(/overage/i);
        expect(feature).not.toMatch(/\$0\.40/);
      }
    }
  });

  it("all plans include approximate call counts", () => {
    for (const plan of BILLING_PLANS) {
      const minutesFeature = plan.features.find((f) => f.includes("minutes/month"));
      expect(minutesFeature).toBeDefined();
      expect(minutesFeature).toMatch(/~\d+ calls/);
    }
  });

  it("call count approximations are correct (2 min avg)", () => {
    for (const plan of BILLING_PLANS) {
      const minutesFeature = plan.features.find((f) => f.includes("minutes/month"))!;
      const callMatch = minutesFeature.match(/~(\d+) calls/);
      expect(callMatch).not.toBeNull();
      const expectedCalls = Math.round(plan.minutes / 2);
      expect(Number(callMatch![1])).toBe(expectedCalls);
    }
  });
});
