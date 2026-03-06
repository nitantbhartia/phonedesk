import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAppUrl, stripe } from "@/lib/stripe";

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
    const session = await getServerSession(authOptions);
    const userId = session ? await resolveUserId(session) : null;
    if (!userId) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const business = await prisma.business.findUnique({
      where: { userId },
      select: { stripeCustomerId: true },
    });
    if (!business?.stripeCustomerId) {
      return NextResponse.json({ error: "No Stripe customer found" }, { status: 400 });
    }

    const portal = await stripe.billingPortal.sessions.create({
      customer: business.stripeCustomerId,
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
