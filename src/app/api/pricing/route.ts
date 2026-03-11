import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { parseJsonBody, requireCurrentBusiness } from "@/lib/route-helpers";

const pricingRuleSchema = z.object({
  serviceId: z.string().trim().min(1, "serviceId is required"),
  breed: z.string().trim().max(100).optional().nullable(),
  size: z.enum(["SMALL", "MEDIUM", "LARGE", "XLARGE"]).optional().nullable(),
  price: z.number().min(0, "Price must be between $0 and $9,999").max(9999, "Price must be between $0 and $9,999"),
  notes: z.string().trim().max(300).optional().nullable(),
});

// GET: List pricing rules for business (include service name)
export async function GET() {
  const businessResult = await requireCurrentBusiness();
  if ("response" in businessResult) {
    return businessResult.response;
  }
  const { business } = businessResult;

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
  const businessResult = await requireCurrentBusiness();
  if ("response" in businessResult) {
    return businessResult.response;
  }
  const { business } = businessResult;

  const bodyResult = await parseJsonBody(req, pricingRuleSchema);
  if ("response" in bodyResult) {
    return bodyResult.response;
  }
  const { serviceId, breed, size, price, notes } = bodyResult.data;

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
  const businessResult = await requireCurrentBusiness();
  if ("response" in businessResult) {
    return businessResult.response;
  }
  const { business } = businessResult;

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

  await prisma.pricingRule.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
