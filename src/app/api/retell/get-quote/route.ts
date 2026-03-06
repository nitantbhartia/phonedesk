import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Voice agent tool endpoint (no auth - called by Retell)
// Input: { breed, size, service_name, business_id? }
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { args, call } = body;
  // Support both Retell custom tool format (args) and direct API calls
  const breed = args?.breed || body.breed;
  const size = args?.size || body.size;
  const service_name = args?.service_name || body.service_name;
  const business_id = args?.business_id || body.business_id;

  if (!service_name) {
    return NextResponse.json({
      quote: "Which service are you interested in? We offer Full Groom, Bath & Brush, and Nail Trim.",
    });
  }

  // Determine business - from explicit id or from call metadata
  let businessId = business_id;

  if (!businessId) {
    // Try to find business from Retell call context
    const calledNumber = call?.to_number || body.call?.to_number;
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
      { quote: "I'm sorry, I'm having a little trouble looking up pricing right now. Can I help you with scheduling instead?" },
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
      quote: `I don't see a service called "${service_name}" in our system. We offer Full Groom, Bath & Brush, and Nail Trim — would any of those work?`,
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
