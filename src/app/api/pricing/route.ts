import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: List pricing rules for business (include service name)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
  });

  if (!business) {
    return NextResponse.json({ error: "No business" }, { status: 404 });
  }

  const pricingRules = await prisma.pricingRule.findMany({
    where: { businessId: business.id },
    include: {
      service: {
        select: { id: true, name: true, price: true },
      },
    },
    orderBy: [{ service: { name: "asc" } }, { breed: "asc" }, { size: "asc" }],
  });

  return NextResponse.json({ pricingRules });
}

// POST: Create or update a pricing rule
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
  });

  if (!business) {
    return NextResponse.json({ error: "No business" }, { status: 404 });
  }

  const body = await req.json();
  const { serviceId, breed, size, price, notes } = body;

  if (!serviceId || price === undefined) {
    return NextResponse.json(
      { error: "serviceId and price are required" },
      { status: 400 }
    );
  }

  if (typeof price !== "number" || price < 0 || price > 9999) {
    return NextResponse.json(
      { error: "Price must be between $0 and $9,999" },
      { status: 400 }
    );
  }

  if (breed && (typeof breed !== "string" || breed.length > 100)) {
    return NextResponse.json(
      { error: "Breed must be 100 characters or less" },
      { status: 400 }
    );
  }

  // Verify the service belongs to this business
  const service = await prisma.service.findFirst({
    where: { id: serviceId, businessId: business.id },
  });

  if (!service) {
    return NextResponse.json({ error: "Service not found" }, { status: 404 });
  }

  const pricingRule = await prisma.pricingRule.upsert({
    where: {
      businessId_serviceId_breed_size: {
        businessId: business.id,
        serviceId,
        breed: breed || null,
        size: size || null,
      },
    },
    create: {
      businessId: business.id,
      serviceId,
      breed: breed || null,
      size: size || null,
      price,
      notes: notes || null,
    },
    update: {
      price,
      notes: notes || null,
      isActive: true,
    },
    include: {
      service: {
        select: { id: true, name: true, price: true },
      },
    },
  });

  return NextResponse.json({ ok: true, pricingRule });
}

// DELETE: Delete a pricing rule by id
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
  });

  if (!business) {
    return NextResponse.json({ error: "No business" }, { status: 404 });
  }

  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  // Verify the pricing rule belongs to this business
  const rule = await prisma.pricingRule.findFirst({
    where: { id, businessId: business.id },
  });

  if (!rule) {
    return NextResponse.json(
      { error: "Pricing rule not found" },
      { status: 404 }
    );
  }

  await prisma.pricingRule.deleteMany({ where: { id, businessId: business.id } });

  return NextResponse.json({ ok: true });
}
