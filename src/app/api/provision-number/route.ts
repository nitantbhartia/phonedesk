import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildAssistantConfig,
  createVapiAssistant,
  provisionVapiPhoneNumber,
} from "@/lib/vapi";

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
      vapiConfig: true,
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
    // Ensure we have a Vapi assistant first
    let assistantId = business.vapiConfig?.assistantId;

    if (!assistantId) {
      const config = buildAssistantConfig(business);
      const assistant = await createVapiAssistant(config);
      assistantId = assistant.id;

      await prisma.vapiConfig.upsert({
        where: { businessId: business.id },
        create: {
          businessId: business.id,
          assistantId,
          systemPrompt: config.model.systemMessage,
          greeting: config.firstMessage,
        },
        update: {
          assistantId,
          systemPrompt: config.model.systemMessage,
          greeting: config.firstMessage,
        },
      });
    }

    // Provision phone number through Vapi (free)
    const result = await provisionVapiPhoneNumber({
      assistantId,
      name: `${business.name} - RingPaw AI`,
    });

    // Save to database
    await prisma.phoneNumber.create({
      data: {
        businessId: business.id,
        number: result.phoneNumber,
        vapiPhoneId: result.id,
        provider: "VAPI",
      },
    });

    // Update onboarding step
    await prisma.business.update({
      where: { id: business.id },
      data: { onboardingStep: 5 },
    });

    return NextResponse.json({
      phoneNumber: result.phoneNumber,
      vapiPhoneId: result.id,
    });
  } catch (error) {
    console.error("Error provisioning number:", error);
    return NextResponse.json(
      { error: "Failed to provision phone number. Check Vapi configuration." },
      { status: 500 }
    );
  }
}
