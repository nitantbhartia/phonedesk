import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { createOutboundCall, syncRebookingAgent } from "@/lib/retell";
import { normalizePhoneNumber } from "@/lib/phone";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json().catch(() => ({})) as { customerPhone?: string };
  const customerPhone = normalizePhoneNumber(body.customerPhone ?? "");
  if (!customerPhone) {
    return NextResponse.json({ error: "customerPhone is required" }, { status: 400 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      business: {
        include: {
          services: { where: { isActive: true } },
          breedRecommendations: true,
          groomers: { where: { isActive: true } },
          retellConfig: true,
          phoneNumber: true,
        },
      },
    },
  });

  const business = user?.business;
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const phoneNumber = business.phoneNumber;
  if (!phoneNumber) {
    return NextResponse.json(
      { error: "No phone number configured. Complete setup first." },
      { status: 400 }
    );
  }

  // Look up the customer
  const customer = await prisma.customer.findUnique({
    where: { businessId_phone: { businessId: business.id, phone: customerPhone } },
    include: { pets: { take: 1 } },
  });

  if (!customer) {
    return NextResponse.json({ error: "Customer not found" }, { status: 404 });
  }

  // Prevent duplicate concurrent outbound calls to the same customer
  const recentOutbound = await prisma.call.findFirst({
    where: {
      businessId: business.id,
      callerPhone: customerPhone,
      isOutbound: true,
      status: "IN_PROGRESS",
    },
  });
  if (recentOutbound) {
    return NextResponse.json(
      { error: "An outbound call to this customer is already in progress." },
      { status: 409 }
    );
  }

  // Sync (or create) the rebooking agent for this business
  const { agentId } = await syncRebookingAgent(business);

  // Build dynamic context for the AI
  const daysSinceVisit = customer.lastVisitAt
    ? Math.floor((Date.now() - customer.lastVisitAt.getTime()) / (1000 * 60 * 60 * 24))
    : null;

  const dynamicVariables: Record<string, string> = {
    customer_name: customer.name,
    pet_name: customer.pets[0]?.name ?? customer.name.split(" ")[0] + "'s pet",
    last_service: customer.lastServiceName ?? "their last service",
    days_since_visit: daysSinceVisit != null ? String(daysSinceVisit) : "a while",
    business_name: business.name,
    business_owner: business.ownerName ?? business.name,
  };

  // Trigger the outbound call
  const call = await createOutboundCall({
    fromNumber: phoneNumber.number,
    toNumber: customerPhone,
    agentId,
    dynamicVariables,
  });

  // Create a Call record immediately so we can track it
  await prisma.call.create({
    data: {
      businessId: business.id,
      retellCallId: call.call_id,
      callerPhone: customerPhone,
      callerName: customer.name,
      status: "IN_PROGRESS",
      isOutbound: true,
    },
  });

  return NextResponse.json({ callId: call.call_id, customer: customer.name });
}
