import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncRetellAgent } from "@/lib/retell";
import { updateRetellPhoneNumber } from "@/lib/retell";
import { buildRetellWebhookUrl } from "@/lib/retell-auth";

const DEMO_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      business: {
        include: {
          services: { where: { isActive: true } },
          retellConfig: true,
          breedRecommendations: { orderBy: { priority: "desc" } },
          groomers: { where: { isActive: true } },
        },
      },
    },
  });

  if (!user?.business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const business = user.business;
  const now = new Date();

  // Idempotent: return existing active session if any
  const existing = await prisma.demoSession.findUnique({
    where: { businessId: business.id },
    include: { demoNumber: true },
  });
  if (existing && existing.expiresAt > now) {
    return NextResponse.json({ demoNumber: existing.demoNumber.number });
  }

  // Ensure the business has a Retell agent
  let agentId = business.retellConfig?.agentId;
  if (!agentId) {
    const synced = await syncRetellAgent(business);
    agentId = synced.agentId || undefined;
  }
  if (!agentId) {
    return NextResponse.json(
      { error: "Could not create AI agent. Please complete your business profile first." },
      { status: 500 }
    );
  }

  // Find an available demo number (not in any active, unexpired session)
  const available = await prisma.demoNumber.findFirst({
    where: {
      sessions: {
        none: { expiresAt: { gt: now } },
      },
    },
  });

  if (!available) {
    return NextResponse.json(
      { error: "demo_unavailable" },
      { status: 503 }
    );
  }

  // Point the demo Retell number at this business's agent
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  await updateRetellPhoneNumber(available.retellPhoneNumber, {
    inboundAgentId: agentId,
    smsWebhookUrl: buildRetellWebhookUrl(appUrl, "/api/sms/webhook"),
  });

  // Create or refresh the demo session
  const expiresAt = new Date(now.getTime() + DEMO_SESSION_TTL_MS);
  await prisma.demoSession.upsert({
    where: { businessId: business.id },
    create: { demoNumberId: available.id, businessId: business.id, expiresAt },
    update: { demoNumberId: available.id, expiresAt },
  });

  return NextResponse.json({ demoNumber: available.number });
}
