import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Plan } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getStripeClient, getStripePriceIdForPlan } from "@/lib/stripe";

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.email) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: { business: true },
    });

    if (!user?.business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    const business = user.business;

    const body = await req.json().catch(() => ({}));
    const plan = (body.plan || "").toString().toUpperCase() as Plan;
    if (!["STARTER", "PRO", "BUSINESS"].includes(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    if (!business.stripeSubscriptionId) {
      return NextResponse.json(
        { error: "No active subscription found. Please subscribe first." },
        { status: 400 }
      );
    }

    const stripe = getStripeClient();
    const priceId = getStripePriceIdForPlan(plan);

    // Retrieve current subscription to get item ID
    const subscription = await stripe.subscriptions.retrieve(business.stripeSubscriptionId);
    const itemId = subscription.items.data[0]?.id;
    if (!itemId) {
      return NextResponse.json({ error: "Subscription item not found" }, { status: 400 });
    }

    // Update subscription inline — Stripe will prorate immediately
    await stripe.subscriptions.update(business.stripeSubscriptionId, {
      items: [{ id: itemId, price: priceId }],
      proration_behavior: "create_prorations",
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("[billing.upgrade] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to upgrade plan" },
      { status: 500 }
    );
  }
}
