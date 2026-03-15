import { describe, it, expect } from "vitest";
import { computeShowSubBanner } from "./dashboard-layout";

describe("computeShowSubBanner", () => {
  it("returns false when business is null", () => {
    expect(computeShowSubBanner(null)).toBe(false);
  });

  it("returns false when business is undefined", () => {
    expect(computeShowSubBanner(undefined)).toBe(false);
  });

  it("shows banner when no subscription and onboarding complete", () => {
    expect(
      computeShowSubBanner({ stripeSubscriptionStatus: null, onboardingComplete: true })
    ).toBe(true);
  });

  it("shows banner when subscription status is empty string and onboarding complete", () => {
    expect(
      computeShowSubBanner({ stripeSubscriptionStatus: "", onboardingComplete: true })
    ).toBe(true);
  });

  it("shows banner when subscription status is canceled and onboarding complete", () => {
    expect(
      computeShowSubBanner({ stripeSubscriptionStatus: "canceled", onboardingComplete: true })
    ).toBe(true);
  });

  it("does NOT show banner when subscription is active", () => {
    expect(
      computeShowSubBanner({ stripeSubscriptionStatus: "active", onboardingComplete: true })
    ).toBe(false);
  });

  it("does NOT show banner when subscription is trialing", () => {
    expect(
      computeShowSubBanner({ stripeSubscriptionStatus: "trialing", onboardingComplete: true })
    ).toBe(false);
  });

  it("does NOT show banner when onboarding is incomplete (no subscription)", () => {
    // Incomplete onboarding → still in setup flow, banner would be noise
    expect(
      computeShowSubBanner({ stripeSubscriptionStatus: null, onboardingComplete: false })
    ).toBe(false);
  });

  it("defaults onboardingComplete to true when field is missing", () => {
    // If field absent, assume onboarding done so banner shows for unsubscribed users
    expect(
      computeShowSubBanner({ stripeSubscriptionStatus: null })
    ).toBe(true);
  });

  it("does NOT show banner when active subscription even if onboarding incomplete", () => {
    expect(
      computeShowSubBanner({ stripeSubscriptionStatus: "active", onboardingComplete: false })
    ).toBe(false);
  });

  it("does NOT show banner when subscription is past_due", () => {
    // past_due is not in the active list — banner should show to prompt re-subscribe
    expect(
      computeShowSubBanner({ stripeSubscriptionStatus: "past_due", onboardingComplete: true })
    ).toBe(true);
  });
});
