import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildAssistantConfig,
  createVapiAssistant,
  updateVapiAssistant,
} from "@/lib/vapi";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
    include: {
      services: { where: { isActive: true } },
      vapiConfig: true,
    },
  });

  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const config = buildAssistantConfig(business);

  try {
    if (business.vapiConfig?.assistantId) {
      // Update existing assistant
      await updateVapiAssistant(business.vapiConfig.assistantId, config);
      await prisma.vapiConfig.update({
        where: { businessId: business.id },
        data: {
          systemPrompt: config.model.systemMessage,
          greeting: config.firstMessage,
        },
      });
    } else {
      // Create new assistant
      const assistant = await createVapiAssistant(config);
      await prisma.vapiConfig.upsert({
        where: { businessId: business.id },
        create: {
          businessId: business.id,
          assistantId: assistant.id,
          systemPrompt: config.model.systemMessage,
          greeting: config.firstMessage,
        },
        update: {
          assistantId: assistant.id,
          systemPrompt: config.model.systemMessage,
          greeting: config.firstMessage,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error configuring Vapi:", error);
    return NextResponse.json(
      { error: "Failed to configure voice agent" },
      { status: 500 }
    );
  }
}
