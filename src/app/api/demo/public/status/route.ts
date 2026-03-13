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

  // 60 polls per minute per token is generous for a UI poller; anything above
  // that is a brute-force probe trying to enumerate session tokens.
  const { allowed } = rateLimit(`demo-status:${token}`, { limit: 60, windowMs: 60_000 });
  if (!allowed) {
    return jsonNoStore({ error: "Too many requests" }, { status: 429 });
  }

  const attempt = await prisma.publicDemoAttempt.findUnique({
    where: { sessionToken: token },
  });

  if (!attempt) {
    return jsonNoStore({ error: "Session not found" }, { status: 404 });
  }

  const demoBizId = process.env.DEMO_BUSINESS_ID;
  if (!demoBizId) {
    return jsonNoStore({ phase: "waiting", summary: null });
  }

  const callerPhone = normalizePhoneNumber(attempt.callerPhone);

  // Before the call starts, callerPhone is null and we have no way to scope the
  // query to this specific session — a broad lookup could return another
  // concurrent demo's call record.  Return "waiting" until the phone is known.
  if (!callerPhone) {
    return jsonNoStore({ phase: "waiting", summary: null });
  }

  // Scope strictly to this caller's phone once we know it.
  const call = await prisma.call.findFirst({
    where: {
      businessId: demoBizId,
      createdAt: { gte: attempt.startedAt },
      OR: [
        { callerPhone },
        { callerPhone: attempt.callerPhone },
      ],
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
  });
}
