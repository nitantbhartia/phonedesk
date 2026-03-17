import { describe, it, expect } from "vitest";
import { computeShowSubBanner } from "./dashboard-layout";

describe("computeShowSubBanner", () => {
  // During free launch mode the subscription banner is always hidden.
  // These tests document the current behaviour; restore the original
  // assertions once Stripe billing is re-enabled.

  it("returns false when business is null", () => {
    expect(computeShowSubBanner(null)).toBe(false);
  });

  it("returns false when business is undefined", () => {
    expect(computeShowSubBanner(undefined)).toBe(false);
  });

  it("returns false during free launch mode (no subscription, onboarding complete)", () => {
    expect(
      computeShowSubBanner({ stripeSubscriptionStatus: null, onboardingComplete: true })
    ).toBe(false);
  });

  it("returns false during free launch mode (active subscription)", () => {
    expect(
      computeShowSubBanner({ stripeSubscriptionStatus: "active", onboardingComplete: true })
    ).toBe(false);
  });
});
