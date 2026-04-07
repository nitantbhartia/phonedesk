/**
 * GET /api/demo/spawkles/status?token={sessionToken}
 *
 * Polls the most recent Spawkles call to determine call phase.
 */

import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import { rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function jsonNoStore(body: unknown, init?: ResponseInit) {
  const response = NextResponse.json(body, init);
  response.headers.set("Cache-Control", "no-store, no-cache, must-revalidate");
  return response;
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return jsonNoStore({ error: "Missing token" }, { status: 400 });
  }

  const { allowed } = rateLimit(`spawkles-status:${token}`, { limit: 60, windowMs: 60_000 });
  if (!allowed) {
    return jsonNoStore({ error: "Too many requests" }, { status: 429 });
  }

  const attempt = await prisma.publicDemoAttempt.findUnique({
    where: { sessionToken: token },
  });

  if (!attempt) {
    return jsonNoStore({ error: "Session not found" }, { status: 404 });
  }

  const bizId = process.env.SPAWKLES_BUSINESS_ID;
  if (!bizId) {
    return jsonNoStore({ phase: "waiting", summary: null });
  }

  const callerPhone = attempt.callerPhone
    ? normalizePhoneNumber(attempt.callerPhone)
    : null;

  // Look up the most recent call for this business since the session started.
  // When callerPhone is not yet set (Spawkles uses PhoneNumber table, not DemoNumber,
  // so the webhook never populates it), fall back to a business + time-window query.
  const call = await prisma.call.findFirst({
    where: callerPhone
      ? {
          businessId: bizId,
          createdAt: { gte: attempt.startedAt },
          OR: [{ callerPhone }, { callerPhone: attempt.callerPhone }],
        }
      : {
          businessId: bizId,
          createdAt: { gte: attempt.startedAt },
        },
    orderBy: { createdAt: "desc" },
  });

  if (!call) {
    return jsonNoStore({ phase: "waiting", summary: null });
  }

  const terminal = ["COMPLETED", "NO_BOOKING", "MISSED"].includes(call.status);
  return jsonNoStore({
    phase: terminal ? "completed" : "in_progress",
    summary: call.summary ?? null,
    transcriptObject: terminal ? (call.transcriptObject ?? null) : null,
  });
}
