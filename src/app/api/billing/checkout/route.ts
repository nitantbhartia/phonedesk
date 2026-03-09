import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import type { Plan } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppUrl, getStripeClient, getStripePriceIdForPlan } from "@/lib/stripe";
import { ensureStripeCustomerForBusiness } from "@/lib/stripe-billing";

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

    const customerId = await ensureStripeCustomerForBusiness({
      businessId: business.id,
      businessName: business.name,
      businessEmail: business.email || session?.user?.email || undefined,
      stripeCustomerId: business.stripeCustomerId,
    });

    const priceId = getStripePriceIdForPlan(plan);
    const appUrl = getAppUrl();

    const rawSuccess = typeof body.successUrl === "string" && body.successUrl.startsWith("/")
      ? body.successUrl : null;
    const rawCancel = typeof body.cancelUrl === "string" && body.cancelUrl.startsWith("/")
      ? body.cancelUrl : null;
    const successUrl = rawSuccess ? `${appUrl}${rawSuccess}` : `${appUrl}/settings/billing?checkout=success`;
    const cancelUrl = rawCancel ? `${appUrl}${rawCancel}` : `${appUrl}/settings/billing?checkout=cancel`;

    const checkout = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
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
