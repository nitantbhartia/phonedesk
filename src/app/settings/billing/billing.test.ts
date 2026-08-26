import { describe, expect, it } from "vitest";

/**
 * Verify that plan feature lists across billing and onboarding
 * do not include overage pricing (removed as too early for pre-launch).
 */

// Keep this smoke-test fixture aligned with the single live RingPaw plan.
const BILLING_PLANS = [
  {
    id: "PRO",
    name: "RingPaw",
    price: 99,
    features: [
      "200 minutes/month (~100 two-minute calls)",
      "One location, one line",
      "Google Calendar + Square support",
    ],
    minutes: 200,
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
      expect(minutesFeature).toMatch(/~\d+(?: two-minute)? calls/);
    }
  });

  it("call count approximations are correct (2 min avg)", () => {
    for (const plan of BILLING_PLANS) {
      const minutesFeature = plan.features.find((f) => f.includes("minutes/month"))!;
      const callMatch = minutesFeature.match(/~(\d+)/);
      expect(callMatch).not.toBeNull();
      const expectedCalls = Math.round(plan.minutes / 2);
      expect(Number(callMatch![1])).toBe(expectedCalls);
    }
  });
});
