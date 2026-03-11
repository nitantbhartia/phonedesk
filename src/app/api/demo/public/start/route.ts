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

  // Check 24h rate limit — has this IP already *called* a demo today?
  // We only count attempts where a call was actually placed (callerPhone set by webhook).
  // Getting a number but never calling does not consume the daily quota.
  const recentAttempt = await prisma.publicDemoAttempt.findFirst({
    where: { ip, startedAt: { gte: windowStart }, callerPhone: { not: null } },
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

  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  // Atomically claim a free demo number. Serializable isolation prevents two
  // concurrent requests from selecting the same available number.
  let claimedNumber: string;
  let attempt: { sessionToken: string; startedAt: Date };
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        const activePublicAttempts = await tx.publicDemoAttempt.findMany({
          where: {
            expiresAt: { gt: now },
            demoNumberId: { not: null },
          },
          select: { demoNumberId: true },
        });
        const occupiedPublicDemoNumberIds = activePublicAttempts
          .map((activeAttempt) => activeAttempt.demoNumberId)
          .filter((demoNumberId): demoNumberId is string =>
            Boolean(demoNumberId)
          );

        const available = await tx.demoNumber.findFirst({
          where: {
            sessions: { none: { expiresAt: { gt: now } } },
            ...(occupiedPublicDemoNumberIds.length > 0
              ? { id: { notIn: occupiedPublicDemoNumberIds } }
              : {}),
          },
        });
        if (!available) throw new Error("demo_unavailable");
        const created = await tx.publicDemoAttempt.create({
          data: { ip, demoNumberId: available.id, expiresAt },
        });
        return { demoNumber: available, attempt: created };
      },
      { isolationLevel: "Serializable" }
    );
    claimedNumber = result.demoNumber.number;
    attempt = result.attempt;

    // Point the demo number at the demo business agent (outside tx — external call)
    await updateRetellPhoneNumber(result.demoNumber.retellPhoneNumber, {
      inboundAgentId: agentId,
    });
  } catch (e) {
    if (e instanceof Error && e.message === "demo_unavailable") {
      return NextResponse.json({ error: "demo_unavailable" }, { status: 503 });
    }
    throw e;
  }

  // Cap at 4-minute calls
  await updateRetellAgent(agentId, {
    maxCallDurationMs: DEMO_CALL_DURATION_MS,
  }).catch((e) => {
    console.error("[demo/public/start] Failed to set call duration limit:", e);
  });

  return NextResponse.json({
    sessionToken: attempt.sessionToken,
    number: claimedNumber,
    startedAt: attempt.startedAt.toISOString(),
  });
}
