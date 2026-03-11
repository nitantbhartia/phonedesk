import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateRetellPhoneNumber, updateRetellAgent, DEMO_CALL_DURATION_MS } from "@/lib/retell";
import { verifyDemoToken } from "@/lib/demo-token";

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

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

  // --- Lead token verification ---
  const body = await req.json().catch(() => ({})) as { ldt?: string };
  const ldt = body?.ldt;

  if (!ldt) {
    return NextResponse.json(
      { error: "verification_required", message: "Please verify your email to access the live demo." },
      { status: 401 }
    );
  }

  const tokenPayload = verifyDemoToken(ldt);
  if (!tokenPayload) {
    return NextResponse.json(
      { error: "invalid_token", message: "Your demo link has expired. Please request a new one." },
      { status: 401 }
    );
  }

  const now = new Date();

  // Load and validate the lead from DB (server-side enforcement)
  const lead = await prisma.demoLead.findUnique({
    where: { id: tokenPayload.leadId },
  });

  if (!lead || !lead.verifiedAt) {
    return NextResponse.json(
      { error: "not_verified", message: "Email verification required." },
      { status: 401 }
    );
  }

  if (lead.cooldownUntil && lead.cooldownUntil > now) {
    const daysLeft = Math.ceil(
      (lead.cooldownUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return NextResponse.json(
      {
        error: "cooldown_active",
        message: `You've already tried the live demo recently. Come back in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
        cooldownUntil: lead.cooldownUntil.toISOString(),
      },
      { status: 429 }
    );
  }

  const ip = getClientIp(req);

  // Check if this lead already has an active session — return it (idempotent)
  const existing = await prisma.publicDemoAttempt.findFirst({
    where: { leadId: lead.id, expiresAt: { gt: now } },
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
        // Collect IDs of numbers already assigned to an active publicDemoAttempt.
        // These are not reflected in the demoSession relation, so we exclude them
        // explicitly to prevent two verified leads from sharing the same number.
        const activeAttemptNumbers = await tx.publicDemoAttempt.findMany({
          where: { demoNumberId: { not: null }, expiresAt: { gt: now } },
          select: { demoNumberId: true },
        });
        const occupiedIds = activeAttemptNumbers.map((a) => a.demoNumberId!);

        const available = await tx.demoNumber.findFirst({
          where: {
            sessions: { none: { expiresAt: { gt: now } } },
            ...(occupiedIds.length > 0 && { id: { notIn: occupiedIds } }),
          },
        });
        if (!available) throw new Error("demo_unavailable");
        const created = await tx.publicDemoAttempt.create({
          data: { ip, demoNumberId: available.id, leadId: lead.id, expiresAt },
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

  // Record that this lead has started a demo session.
  // Cooldown is set only when a real call begins (call_started webhook),
  // so a page reload or link preview cannot burn the lead's weekly quota.
  await prisma.demoLead.update({
    where: { id: lead.id },
    data: { lastDemoAt: now },
  });

  return NextResponse.json({
    sessionToken: attempt.sessionToken,
    number: claimedNumber,
    startedAt: attempt.startedAt.toISOString(),
  });
}
