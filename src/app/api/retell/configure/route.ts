import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  buildAgentConfig,
  createRetellLLM,
  createRetellAgent,
  updateRetellLLM,
  updateRetellAgent,
} from "@/lib/retell";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
    include: {
      services: { where: { isActive: true } },
      retellConfig: true,
    },
  });

  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const config = buildAgentConfig(business);

  try {
    if (business.retellConfig?.agentId && business.retellConfig?.llmId) {
      // Update existing LLM and agent
      await updateRetellLLM(business.retellConfig.llmId, {
        generalPrompt: config.generalPrompt,
        beginMessage: config.beginMessage,
        tools: config.tools,
      });
      await updateRetellAgent(business.retellConfig.agentId, {
        agentName: config.agentName,
        webhookUrl: config.webhookUrl,
      });
      await prisma.retellConfig.update({
        where: { businessId: business.id },
        data: {
          systemPrompt: config.generalPrompt,
          greeting: config.beginMessage,
        },
      });
    } else {
      // Create new LLM and agent
      const llm = await createRetellLLM({
        generalPrompt: config.generalPrompt,
        beginMessage: config.beginMessage,
        tools: config.tools,
      });

      const agent = await createRetellAgent({
        llmId: llm.llm_id,
        agentName: config.agentName,
        voiceId: config.voiceId,
        webhookUrl: config.webhookUrl,
      });

      await prisma.retellConfig.upsert({
        where: { businessId: business.id },
        create: {
          businessId: business.id,
          agentId: agent.agent_id,
          llmId: llm.llm_id,
          systemPrompt: config.generalPrompt,
          greeting: config.beginMessage,
        },
        update: {
          agentId: agent.agent_id,
          llmId: llm.llm_id,
          systemPrompt: config.generalPrompt,
          greeting: config.beginMessage,
        },
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error configuring Retell:", error);
    return NextResponse.json(
      { error: "Failed to configure voice agent" },
      { status: 500 }
    );
  }
}
