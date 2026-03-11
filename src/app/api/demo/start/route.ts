import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncRetellAgent, updateRetellPhoneNumber, updateRetellAgent, DEMO_CALL_DURATION_MS } from "@/lib/retell";

const DEMO_SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

// Max test call sessions provisioned per business (cumulative, across all time)
const MAX_TEST_SESSIONS_PER_BUSINESS = 5;

// In-memory IP rate limiter: max 3 demo starts per IP per 24 hours.
// Resets on deploy — intentionally lightweight, just adds friction for scripted abuse.
const ipAttempts = new Map<string, number[]>();
const IP_WINDOW_MS = 24 * 60 * 60 * 1000;
const IP_MAX_ATTEMPTS = 3;

function checkIpRateLimit(ip: string): boolean {
  const now = Date.now();
  const windowStart = now - IP_WINDOW_MS;
  const recent = (ipAttempts.get(ip) ?? []).filter((t) => t > windowStart);
  if (recent.length >= IP_MAX_ATTEMPTS) return false;
  ipAttempts.set(ip, [...recent, now]);
  return true;
}

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // IP rate limit — soft abuse prevention
  const ip = getClientIp(req);
  if (!checkIpRateLimit(ip)) {
    return NextResponse.json(
      { error: "rate_limited", message: "Too many test requests. Please try again tomorrow." },
      { status: 429 }
    );
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

  // Per-account cap: count actual test calls made for this business
  const testCallCount = await prisma.call.count({
    where: { businessId: business.id, isTestCall: true },
  });
  if (testCallCount >= MAX_TEST_SESSIONS_PER_BUSINESS) {
    return NextResponse.json(
      { error: "test_limit_reached", message: "Maximum test calls reached. Please go live to continue." },
      { status: 429 }
    );
  }

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

  // Point the demo Retell number at this business's agent.
  // smsWebhookUrl intentionally omitted — demo numbers aren't A2P-registered.
  await updateRetellPhoneNumber(available.retellPhoneNumber, {
    inboundAgentId: agentId,
  });

  // Cap test calls at 4 minutes — the agent will be reset to 5 min on next syncRetellAgent call
  await updateRetellAgent(agentId, { maxCallDurationMs: DEMO_CALL_DURATION_MS }).catch((e) => {
    console.error("[demo/start] Failed to set demo call duration limit:", e);
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
