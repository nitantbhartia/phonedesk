import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";

type EnsureStripeCustomerInput = {
  businessId: string;
  businessName: string;
  businessEmail?: string | null;
  stripeCustomerId?: string | null;
};

function isStripeNotFoundError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const maybe = error as { code?: string; type?: string; statusCode?: number };
  return maybe.code === "resource_missing" || maybe.statusCode === 404 || maybe.type === "StripeInvalidRequestError";
}

export async function ensureStripeCustomerForBusiness(
  input: EnsureStripeCustomerInput
): Promise<string> {
  const stripe = getStripeClient();

  const currentId = input.stripeCustomerId || null;
  if (currentId) {
    try {
      const existing = await stripe.customers.retrieve(currentId);
      if (!("deleted" in existing && existing.deleted)) {
        return existing.id;
      }
    } catch (error) {
      if (!isStripeNotFoundError(error)) throw error;
    }
  }

  let matchedCustomerId: string | null = null;
  if (input.businessEmail) {
    const byEmail = await stripe.customers.list({
      email: input.businessEmail,
      limit: 100,
    });

    const metadataMatch = byEmail.data.find((customer) => {
      if ("deleted" in customer && customer.deleted) return false;
      return customer.metadata?.businessId === input.businessId;
    });

    const fallback = byEmail.data.find((customer) => !("deleted" in customer && customer.deleted));
    matchedCustomerId = metadataMatch?.id || fallback?.id || null;
  }

  const customerId = matchedCustomerId
    ? matchedCustomerId
    : (
      await stripe.customers.create({
        email: input.businessEmail || undefined,
        name: input.businessName,
        metadata: {
          businessId: input.businessId,
        },
      })
    ).id;

  if (customerId !== currentId) {
    await prisma.business.update({
      where: { id: input.businessId },
      data: { stripeCustomerId: customerId },
    });
  }

  return customerId;
}
