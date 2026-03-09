import { NextRequest, NextResponse } from "next/server";
import Stripe from "stripe";
import { prisma } from "@/lib/prisma";
import { getPlanForStripePriceId, getStripeClient } from "@/lib/stripe";
import { updateReferralQualificationForBusiness } from "@/lib/referrals";

function getWebhookSecret() {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error("Missing STRIPE_WEBHOOK_SECRET");
  }
  return secret;
}

export async function POST(req: NextRequest) {
  const stripe = getStripeClient();
  const signature = req.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Missing stripe-signature header" }, { status: 400 });
  }

  let event: Stripe.Event;
  try {
    const rawBody = await req.text();
    event = stripe.webhooks.constructEvent(rawBody, signature, getWebhookSecret());
  } catch (error) {
    console.error("[stripe.webhook] Signature verification failed:", error);
    return NextResponse.json({ error: "Invalid webhook signature" }, { status: 400 });
  }

  try {
    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      const businessId = session.metadata?.businessId;
      if (businessId) {
        await prisma.business.update({
          where: { id: businessId },
          data: {
            stripeCustomerId:
              typeof session.customer === "string" ? session.customer : undefined,
            stripeSubscriptionId:
              typeof session.subscription === "string" ? session.subscription : undefined,
          },
        });
      }
    }

    if (
      event.type === "customer.subscription.created" ||
      event.type === "customer.subscription.updated"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : null;
      if (customerId) {
        const primaryItem = subscription.items.data[0];
        const priceId = primaryItem?.price?.id || null;
        const plan = getPlanForStripePriceId(priceId);

        const updateData: Record<string, unknown> = {
          stripeSubscriptionId: subscription.id,
          stripePriceId: priceId || undefined,
          stripeSubscriptionStatus: subscription.status,
          plan,
        };
        // When a subscription becomes active, re-enable call answering
        // (covers reactivation after cancellation and initial activation)
        if (subscription.status === "active") {
          updateData.isActive = true;
        }
        await prisma.business.updateMany({
          where: { stripeCustomerId: customerId },
          data: updateData,
        });

        const businesses = await prisma.business.findMany({
          where: { stripeCustomerId: customerId },
          select: { id: true },
        });

        await Promise.all(
          businesses.map((business) =>
            updateReferralQualificationForBusiness({
              businessId: business.id,
              plan,
              stripeSubscriptionStatus: subscription.status,
            })
          )
        );
      }
    }

    if (
      event.type === "customer.subscription.deleted" ||
      event.type === "customer.subscription.paused"
    ) {
      const subscription = event.data.object as Stripe.Subscription;
      const customerId =
        typeof subscription.customer === "string" ? subscription.customer : null;
      if (customerId) {
        // Disable live call answering and downgrade plan
        await prisma.business.updateMany({
          where: { stripeCustomerId: customerId },
          data: {
            stripeSubscriptionId: null,
            stripePriceId: null,
            stripeSubscriptionStatus: subscription.status,
            plan: "STARTER",
            isActive: false,
          },
        });
        // Also disable the Retell agent flag so the dashboard reflects reality
        const businesses = await prisma.business.findMany({
          where: { stripeCustomerId: customerId },
          select: { id: true },
        });
        for (const biz of businesses) {
          await prisma.retellConfig.updateMany({
            where: { businessId: biz.id },
            data: { isActive: false },
          });
        }

        await Promise.all(
          businesses.map((business) =>
            updateReferralQualificationForBusiness({
              businessId: business.id,
              plan: "STARTER",
              stripeSubscriptionStatus: subscription.status,
            })
          )
        );
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("[stripe.webhook] Handler error:", error);
    return NextResponse.json({ error: "Webhook handling failed" }, { status: 500 });
  }
}
