import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  provisionRetellPhoneNumber,
  syncRetellAgent,
} from "@/lib/retell";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
    include: {
      phoneNumber: true,
      services: { where: { isActive: true } },
      retellConfig: true,
    },
  });

  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  // Return existing number if already provisioned
  if (business.phoneNumber) {
    return NextResponse.json({
      phoneNumber: business.phoneNumber.number,
      alreadyProvisioned: true,
    });
  }

  try {
    // Ensure we have a Retell agent first
    let agentId = business.retellConfig?.agentId;

    if (!agentId) {
      const synced = await syncRetellAgent(business);
      agentId = synced.agentId || undefined;
    }

    // Provision phone number through Retell
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const result = await provisionRetellPhoneNumber({
      agentId,
      nickname: `${business.name} - RingPaw AI`,
      smsWebhookUrl: `${appUrl}/api/sms/webhook`,
    });

    // Save to database
    await prisma.phoneNumber.create({
      data: {
        businessId: business.id,
        number: result.phone_number,
        retellPhoneNumber: result.phone_number,
        provider: "RETELL",
      },
    });

    // Update onboarding step
    await prisma.business.update({
      where: { id: business.id },
      data: { onboardingStep: 5 },
    });

    return NextResponse.json({
      phoneNumber: result.phone_number,
    });
  } catch (error) {
    console.error("Error provisioning number:", error);
    return NextResponse.json(
      { error: "Failed to provision phone number. Check Retell configuration." },
      { status: 500 }
    );
  }
}
