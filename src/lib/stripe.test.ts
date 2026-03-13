import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("stripe", () => ({
  default: vi.fn().mockImplementation(() => ({ mocked: true })),
}));

describe("stripe helpers", () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    process.env.STRIPE_SECRET_KEY = "sk_test_123";
    process.env.STRIPE_STARTER_PRICE_ID = "price_starter";
    process.env.STRIPE_PRO_PRICE_ID = "price_pro";
    process.env.STRIPE_BUSINESS_PRICE_ID = "price_business";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("returns configured price IDs and resolves plan names", async () => {
    const mod = await import("./stripe");

    expect(mod.getStripeClient()).toEqual({ mocked: true });
    expect(mod.getStripeClient()).toBe(mod.getStripeClient());
    expect(mod.getStripePriceIdForPlan("PRO")).toBe("price_pro");
    expect(mod.getPlanForStripePriceId("price_business")).toBe("BUSINESS");
    expect(mod.getPlanForStripePriceId(undefined)).toBe("STARTER");
    expect(mod.getAppUrl()).toBe("https://app.example.com");
  });

  it("throws when a plan is missing a configured price ID", async () => {
    delete process.env.STRIPE_PRO_PRICE_ID;
    const mod = await import("./stripe");

    expect(() => mod.getStripePriceIdForPlan("PRO")).toThrow(
      "Missing Stripe price ID env var for plan PRO"
    );
  });

  it("throws when the Stripe secret key is missing and falls back to NEXTAUTH_URL", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    delete process.env.NEXT_PUBLIC_APP_URL;
    process.env.NEXTAUTH_URL = "https://auth.example.com";
    const mod = await import("./stripe");

    expect(() => mod.getStripeClient()).toThrow("Missing STRIPE_SECRET_KEY");
    expect(mod.getAppUrl()).toBe("https://auth.example.com");
  });
});
