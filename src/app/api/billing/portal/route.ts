import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppUrl, getStripeClient } from "@/lib/stripe";
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

export async function POST() {
  try {
    const stripe = getStripeClient();
    const session = await getServerSession(authOptions);
    const userId = session ? await resolveUserId(session) : null;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const business = await prisma.business.findUnique({
      where: { userId },
      select: {
        id: true,
        name: true,
        email: true,
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

    const portal = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: `${getAppUrl()}/settings/billing`,
    });

    return NextResponse.json({ url: portal.url });
  } catch (error) {
    console.error("[billing.portal] Error:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to create billing portal session" },
      { status: 500 }
    );
  }
}
