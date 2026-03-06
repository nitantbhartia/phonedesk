import Stripe from "stripe";
import type { Plan } from "@prisma/client";

let stripeClient: Stripe | null = null;

export function getStripeClient(): Stripe {
  if (stripeClient) return stripeClient;

  const secretKey = process.env.STRIPE_SECRET_KEY;
  if (!secretKey) {
    throw new Error("Missing STRIPE_SECRET_KEY");
  }

  stripeClient = new Stripe(secretKey, {
    // Use the SDK's pinned latest API version to avoid type mismatches.
    apiVersion: undefined,
  });

  return stripeClient;
}

const PRICE_IDS: Record<Plan, string | undefined> = {
  STARTER: process.env.STRIPE_STARTER_PRICE_ID,
  PRO: process.env.STRIPE_PRO_PRICE_ID,
  BUSINESS: process.env.STRIPE_BUSINESS_PRICE_ID,
};

export function getStripePriceIdForPlan(plan: Plan): string {
  const priceId = PRICE_IDS[plan];
  if (!priceId) {
    throw new Error(`Missing Stripe price ID env var for plan ${plan}`);
  }
  return priceId;
}

export function getPlanForStripePriceId(priceId: string | null | undefined): Plan {
  if (!priceId) return "STARTER";
  if (priceId === process.env.STRIPE_BUSINESS_PRICE_ID) return "BUSINESS";
  if (priceId === process.env.STRIPE_PRO_PRICE_ID) return "PRO";
  return "STARTER";
}

export function getAppUrl() {
  return process.env.NEXT_PUBLIC_APP_URL || process.env.NEXTAUTH_URL || "http://localhost:3000";
}
