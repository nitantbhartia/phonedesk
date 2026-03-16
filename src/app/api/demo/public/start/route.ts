import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateRetellPhoneNumber, updateRetellAgent, DEMO_CALL_DURATION_MS } from "@/lib/retell";
import { cleanupIdleDemoNumbers } from "@/lib/demo-session";

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes
const RATE_LIMIT_WINDOW_MS = 3 * 24 * 60 * 60 * 1000; // 3 days
const MAX_ATTEMPTS_PER_IP = 3; // max sessions per IP within rate-limit window

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

  // Check if this IP already has an active session — return it (idempotent)
  const existing = await prisma.publicDemoAttempt.findFirst({
    where: { ip, expiresAt: { gt: now } },
    orderBy: { startedAt: "desc" },
  });

  if (existing) {
    const demoNum = existing.demoNumberId
      ? await prisma.demoNumber.findUnique({ where: { id: existing.demoNumberId } })
      : null;
    return NextResponse.json({
      sessionToken: existing.sessionToken,
      number: demoNum?.number ?? null,
      startedAt: existing.startedAt.toISOString(),
    });
  }

  // Rate limit by IP: prevent repeated demo-number claiming
  const recentAttempts = await prisma.publicDemoAttempt.count({
    where: {
      ip,
      startedAt: { gte: new Date(now.getTime() - RATE_LIMIT_WINDOW_MS) },
    },
  });
  if (recentAttempts >= MAX_ATTEMPTS_PER_IP) {
    return NextResponse.json(
      {
        error: "cooldown_active",
        message: "You've already tried the live demo recently. Try again later.",
      },
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
  let isExistingSession = false;
  try {
    const result = await prisma.$transaction(
      async (tx) => {
        // Re-check inside the transaction: a concurrent request from the same
        // IP may have already created an active session between the outer
        // idempotency check and this point.
        const existingInTx = await tx.publicDemoAttempt.findFirst({
          where: { ip, expiresAt: { gt: now } },
          orderBy: { startedAt: "desc" },
          include: { demoNumber: true },
        });
        if (existingInTx) {
          return { demoNumber: existingInTx.demoNumber, attempt: existingInTx, isExisting: true };
        }

        // Collect IDs of numbers already assigned to an active publicDemoAttempt.
        const activePublicAttempts = await tx.publicDemoAttempt.findMany({
          where: {
            expiresAt: { gt: now },
            demoNumberId: { not: null },
          },
          select: { demoNumberId: true },
        });
        const occupiedPublicDemoNumberIds = activePublicAttempts
          .map((a) => a.demoNumberId)
          .filter((id): id is string => Boolean(id));

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
        return { demoNumber: available, attempt: created, isExisting: false };
      },
      { isolationLevel: "Serializable" }
    );
    claimedNumber = result.demoNumber?.number ?? "";
    attempt = result.attempt;
    isExistingSession = result.isExisting;

    // Point the demo number at the demo business agent (outside tx — external call).
    if (!isExistingSession && result.demoNumber) {
      await updateRetellPhoneNumber(result.demoNumber.retellPhoneNumber, {
        inboundAgentId: agentId,
      });
      cleanupIdleDemoNumbers(result.demoNumber.id).catch((e) =>
        console.error("[demo/public/start] cleanupIdleDemoNumbers failed:", e)
      );
    }
  } catch (e) {
    if (e instanceof Error && e.message === "demo_unavailable") {
      return NextResponse.json({ error: "demo_unavailable" }, { status: 503 });
    }
    throw e;
  }

  // Cap demo calls at 2 minutes
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
