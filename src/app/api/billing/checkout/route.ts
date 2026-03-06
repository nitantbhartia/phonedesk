import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Plan } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppUrl, getStripeClient, getStripePriceIdForPlan } from "@/lib/stripe";

async function resolveUserId(session: {
  user?: { id?: string | null; email?: string | null; name?: string | null; image?: string | null };
}) {
  const email = session.user?.email;
  if (!email) return session.user?.id ?? null;

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: session.user?.name ?? undefined,
      image: session.user?.image ?? undefined,
    },
    update: {
      name: session.user?.name ?? undefined,
      image: session.user?.image ?? undefined,
    },
  });
  return user.id;
}

export async function POST(req: NextRequest) {
  try {
    const stripe = getStripeClient();
    const session = await getServerSession(authOptions);
    const userId = session ? await resolveUserId(session) : null;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json().catch(() => ({}));
    const plan = (body.plan || "").toString().toUpperCase() as Plan;
    if (!["STARTER", "PRO", "BUSINESS"].includes(plan)) {
      return NextResponse.json({ error: "Invalid plan" }, { status: 400 });
    }

    const business = await prisma.business.findUnique({
      where: { userId },
      select: {
        id: true,
        name: true,
        email: true,
        plan: true,
        stripeCustomerId: true,
      },
    });
    if (!business) {
      return NextResponse.json({ error: "Business not found" }, { status: 404 });
    }

    let customerId = business.stripeCustomerId || undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: business.email || session?.user?.email || undefined,
        name: business.name,
        metadata: {
          businessId: business.id,
        },
      });
      customerId = customer.id;
      await prisma.business.update({
        where: { id: business.id },
        data: { stripeCustomerId: customerId },
      });
    }

    const priceId = getStripePriceIdForPlan(plan);
    const appUrl = getAppUrl();
    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${appUrl}/settings/billing?checkout=success`,
      cancel_url: `${appUrl}/settings/billing?checkout=cancel`,
      allow_promotion_codes: true,
      billing_address_collection: "auto",
      metadata: {
        businessId: business.id,
        requestedPlan: plan,
      },
    });

    return NextResponse.json({ url: checkout.url });
  } catch (error) {
    console.error("[billing.checkout] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create checkout session" },
      { status: 500 }
    );
  }
}
