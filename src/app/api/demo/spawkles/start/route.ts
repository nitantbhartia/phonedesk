/**
 * POST /api/demo/spawkles/start
 *
 * Returns the dedicated Spawkles demo phone number and creates a lightweight
 * session record so we can track the caller's phone after call_started fires.
 *
 * Unlike the public demo, this uses a dedicated pre-provisioned number —
 * no pool allocation needed.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

const SESSION_TTL_MS = 30 * 60 * 1000; // 30 minutes

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const bizId = process.env.SPAWKLES_BUSINESS_ID;
  if (!bizId) {
    return NextResponse.json(
      { error: "Spawkles demo not configured" },
      { status: 503 }
    );
  }

  const ip = getClientIp(req);
  const now = new Date();

  // Optional body: { reset: true } — set when the user clicks "Try another call".
  // Expires any active attempts for this IP so the new attempt gets a fresh
  // startedAt (otherwise the stream/status time-window would still match the
  // previously completed Call and we'd flip straight back to the completed view).
  let reset = false;
  try {
    const body = (await req.json()) as { reset?: boolean } | null;
    reset = !!body?.reset;
  } catch {
    // empty / malformed body is fine
  }

  if (reset) {
    await prisma.publicDemoAttempt.updateMany({
      where: { ip, expiresAt: { gt: now } },
      data: { expiresAt: now },
    });
  }

  // Check for existing active session from this IP
  const existing = await prisma.publicDemoAttempt.findFirst({
    where: { ip, expiresAt: { gt: now } },
    orderBy: { startedAt: "desc" },
  });

  if (existing) {
    // Return existing session
    const business = await prisma.business.findUnique({
      where: { id: bizId },
      include: { phoneNumber: true },
    });
    return NextResponse.json({
      sessionToken: existing.sessionToken,
      number: business?.phoneNumber?.number ?? null,
      startedAt: existing.startedAt.toISOString(),
    });
  }

  // Look up the Spawkles business and its dedicated phone number
  const business = await prisma.business.findUnique({
    where: { id: bizId },
    include: { phoneNumber: true, retellConfig: true },
  });

  if (!business?.phoneNumber || !business.retellConfig?.agentId) {
    return NextResponse.json(
      { error: "demo_not_ready", message: "Spawkles demo agent is not configured yet." },
      { status: 503 }
    );
  }

  const expiresAt = new Date(now.getTime() + SESSION_TTL_MS);

  // Create a session record so the stream/status endpoints can track this caller
  const attempt = await prisma.publicDemoAttempt.create({
    data: { ip, expiresAt },
  });

  return NextResponse.json({
    sessionToken: attempt.sessionToken,
    number: business.phoneNumber.number,
    startedAt: attempt.startedAt.toISOString(),
  });
}
