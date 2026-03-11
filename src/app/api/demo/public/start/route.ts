import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateRetellPhoneNumber, updateRetellAgent, DEMO_CALL_DURATION_MS } from "@/lib/retell";

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000; // 24 hours

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const demoBizId = process.env.DEMO_BUSINESS_ID;
  if (!demoBizId) {
    return NextResponse.json(
      { error: "Demo not configured" },
      { status: 503 }
    );
  }

  const ip = getClientIp(req);
  const now = new Date();
  const windowStart = new Date(now.getTime() - RATE_LIMIT_WINDOW_MS);

  // Check if this IP has an existing active session — return it (idempotent)
  const existing = await prisma.publicDemoAttempt.findFirst({
    where: { ip, expiresAt: { gt: now } },
    orderBy: { startedAt: "desc" },
  });

  if (existing) {
    // Fetch the demo number for this session
    const demoNum = existing.demoNumberId
      ? await prisma.demoNumber.findUnique({ where: { id: existing.demoNumberId } })
      : null;
    return NextResponse.json({
      sessionToken: existing.sessionToken,
      number: demoNum?.number ?? null,
      startedAt: existing.startedAt.toISOString(),
    });
  }

  // Check 24h rate limit — has this IP already done a demo today?
  const recentAttempt = await prisma.publicDemoAttempt.findFirst({
    where: { ip, startedAt: { gte: windowStart } },
  });

  if (recentAttempt) {
    return NextResponse.json(
      { error: "rate_limited", message: "You've already tried the demo in the last 24 hours." },
      { status: 429 }
    );
  }

  // Verify the demo business has a Retell agent
  const demoBusiness = await prisma.business.findUnique({
    where: { id: demoBizId },
    include: { retellConfig: true },
  });

  const agentId = demoBusiness?.retellConfig?.agentId;
  if (!agentId) {
    return NextResponse.json(
      { error: "demo_not_ready", message: "Demo agent is not configured yet." },
      { status: 503 }
    );
  }

  // Find an available demo number
  const available = await prisma.demoNumber.findFirst({
    where: {
      sessions: { none: { expiresAt: { gt: now } } },
    },
  });

  if (!available) {
    return NextResponse.json({ error: "demo_unavailable" }, { status: 503 });
  }

  // Point the demo number at the demo business agent
  await updateRetellPhoneNumber(available.retellPhoneNumber, {
    inboundAgentId: agentId,
  });

  // Cap at 4-minute calls
  await updateRetellAgent(agentId, {
    maxCallDurationMs: DEMO_CALL_DURATION_MS,
  }).catch((e) => {
    console.error("[demo/public/start] Failed to set call duration limit:", e);
  });

  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  const attempt = await prisma.publicDemoAttempt.create({
    data: { ip, demoNumberId: available.id, expiresAt },
  });

  return NextResponse.json({
    sessionToken: attempt.sessionToken,
    number: available.number,
    startedAt: attempt.startedAt.toISOString(),
  });
}
