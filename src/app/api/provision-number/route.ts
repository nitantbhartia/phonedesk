import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { provisionPhoneNumber } from "@/lib/twilio";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
    include: { twilioNumber: true },
  });

  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  // Return existing number if already provisioned
  if (business.twilioNumber) {
    return NextResponse.json({
      phoneNumber: business.twilioNumber.phoneNumber,
      alreadyProvisioned: true,
    });
  }

  const { areaCode } = await req.json();

  try {
    const result = await provisionPhoneNumber(areaCode || "415");

    // Save to database
    await prisma.twilioNumber.create({
      data: {
        businessId: business.id,
        phoneNumber: result.phoneNumber,
        twilioSid: result.sid,
        capabilities: result.capabilities,
      },
    });

    // Update onboarding step
    await prisma.business.update({
      where: { id: business.id },
      data: { onboardingStep: 5 },
    });

    return NextResponse.json({
      phoneNumber: result.phoneNumber,
      sid: result.sid,
    });
  } catch (error) {
    console.error("Error provisioning number:", error);
    return NextResponse.json(
      { error: "Failed to provision phone number. Check Twilio configuration." },
      { status: 500 }
    );
  }
}
