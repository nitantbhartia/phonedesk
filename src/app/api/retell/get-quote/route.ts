import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Voice agent tool endpoint (no auth - called by Retell)
// Input: { breed, size, service_name, business_id? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { breed, size, service_name, business_id } = body;

  if (!service_name) {
    return NextResponse.json(
      { error: "service_name is required" },
      { status: 400 }
    );
  }

  // Determine business - from explicit id or from call metadata
  let businessId = business_id;

  if (!businessId) {
    // Try to find business from Retell call context
    const calledNumber = body.call?.to_number;
    if (calledNumber) {
      const phoneNum = await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
      });
      if (phoneNum) businessId = phoneNum.businessId;
    }
  }

  if (!businessId) {
    // Fall back: find the first active business (single-tenant scenario)
    const business = await prisma.business.findFirst({
      where: { isActive: true },
    });
    if (business) businessId = business.id;
  }

  if (!businessId) {
    return NextResponse.json(
      { quote: "I'm sorry, I can't look up pricing right now. Let me have the owner call you back with a quote." },
      { status: 200 }
    );
  }

  // Find the service by name (case-insensitive)
  const service = await prisma.service.findFirst({
    where: {
      businessId,
      name: { contains: service_name, mode: "insensitive" },
      isActive: true,
    },
  });

  if (!service) {
    return NextResponse.json({
      quote: `I don't see a service called "${service_name}" in our system. Let me check with the owner and get back to you.`,
      service_name,
      breed: breed || null,
      size: size || null,
      notes: null,
    });
  }

  // Look for pricing rules in order of specificity:
  // 1. Exact match: breed + size + service
  // 2. Breed-only match: breed + service (any size)
  // 3. Size-only match: size + service (any breed)
  // 4. Base service price

  const normalizedBreed = breed?.trim().toLowerCase() || null;
  const normalizedSize = size?.trim().toUpperCase() || null;

  let matchedRule = null;
  let matchLevel = "base";

  if (normalizedBreed && normalizedSize) {
    // 1. Exact match: breed + size
    matchedRule = await prisma.pricingRule.findFirst({
      where: {
        businessId,
        serviceId: service.id,
        breed: { equals: normalizedBreed, mode: "insensitive" },
        size: normalizedSize as "SMALL" | "MEDIUM" | "LARGE" | "XLARGE",
        isActive: true,
      },
    });
    if (matchedRule) matchLevel = "breed+size";
  }

  if (!matchedRule && normalizedBreed) {
    // 2. Breed-only match
    matchedRule = await prisma.pricingRule.findFirst({
      where: {
        businessId,
        serviceId: service.id,
        breed: { equals: normalizedBreed, mode: "insensitive" },
        size: null,
        isActive: true,
      },
    });
    if (matchedRule) matchLevel = "breed";
  }

  if (!matchedRule && normalizedSize) {
    // 3. Size-only match
    matchedRule = await prisma.pricingRule.findFirst({
      where: {
        businessId,
        serviceId: service.id,
        breed: null,
        size: normalizedSize as "SMALL" | "MEDIUM" | "LARGE" | "XLARGE",
        isActive: true,
      },
    });
    if (matchedRule) matchLevel = "size";
  }

  const finalPrice = matchedRule ? matchedRule.price : service.price;
  const notes = matchedRule?.notes || null;

  return NextResponse.json({
    quote: `$${finalPrice}`,
    service_name: service.name,
    breed: breed || null,
    size: size || null,
    notes,
    match_level: matchLevel,
  });
}
