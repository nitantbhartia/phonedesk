import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  ensureTwilioWebhooks,
  purchaseTwilioPhoneNumber,
  releaseTwilioPhoneNumber,
} from "@/lib/twilio";

/**
 * POST /api/admin/approve-business
 *
 * Approves a business to go live. Sets adminApprovedGoLive, provisions a phone
 * number, and activates the business.
 *
 * Body: { businessId: "clx..." }
 *
 * Auth: requires ADMIN_SECRET env var as Bearer token.
 */
export async function POST(req: Request) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET is not configured" },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { businessId?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { businessId } = body;
  if (!businessId) {
    return NextResponse.json(
      { error: "businessId is required" },
      { status: 400 }
    );
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      phoneNumber: true,
      services: { where: { isActive: true } },
      breedRecommendations: { orderBy: { priority: "desc" } },
      groomers: { where: { isActive: true } },
    },
  });

  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  // 1. Mark as approved
  await prisma.business.update({
    where: { id: businessId },
    data: { adminApprovedGoLive: true },
  });

  // 2. Provision a Twilio phone number if not already provisioned
  let phoneNumber = business.phoneNumber?.number ?? null;
  if (!phoneNumber) {
    const phoneDigits = (business.phone ?? "").replace(/\D/g, "");
    const areaCode =
      phoneDigits.length >= 10
        ? Number(phoneDigits.slice(phoneDigits.length === 11 ? 1 : 0, 3))
        : undefined;

    const result = await purchaseTwilioPhoneNumber({ areaCode });

    if (
      typeof result.phoneNumber === "string" &&
      /^\+\d{10,15}$/.test(result.phoneNumber)
    ) {
      try {
        await ensureTwilioWebhooks(result.phoneNumber);
        await prisma.phoneNumber.create({
          data: {
            businessId,
            number: result.phoneNumber,
            twilioPhoneNumberSid: result.sid,
            provider: "TWILIO",
            isActive: true,
          },
        });
        phoneNumber = result.phoneNumber;
      } catch (error) {
        await releaseTwilioPhoneNumber(result.sid).catch((cleanupError) => {
          console.error("[admin] Failed to clean up Twilio number:", cleanupError);
        });
        throw error;
      }
    } else {
      return NextResponse.json(
        { error: "Failed to provision phone number from Twilio" },
        { status: 500 }
      );
    }
  }

  // 3. Activate the business
  await prisma.business.update({
    where: { id: businessId },
    data: { isActive: true },
  });

  // 4. End any lingering demo session
  await prisma.demoSession
    .delete({ where: { businessId } })
    .catch(() => { /* no demo session — that's fine */ });

  return NextResponse.json({
    success: true,
    businessId,
    phoneNumber,
    businessName: business.name,
    ownerPhone: business.phone,
  });
}
