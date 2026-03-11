import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return NextResponse.json({ error: "Missing token" }, { status: 400 });
  }

  const attempt = await prisma.publicDemoAttempt.findUnique({
    where: { sessionToken: token },
  });

  if (!attempt) {
    return NextResponse.json({ error: "Session not found" }, { status: 404 });
  }

  const demoBizId = process.env.DEMO_BUSINESS_ID;
  if (!demoBizId) {
    return NextResponse.json({ phase: "waiting", summary: null });
  }

  const callerPhone = normalizePhoneNumber(attempt.callerPhone);

  // Prefer the exact caller once the call has started; this keeps one public
  // demo session from picking up another lead's call state or summary.
  const call = await prisma.call.findFirst({
    where: {
      businessId: demoBizId,
      createdAt: { gte: attempt.startedAt },
      ...(callerPhone
        ? {
            OR: [
              { callerPhone },
              { callerPhone: attempt.callerPhone },
            ],
          }
        : {}),
    },
    orderBy: { createdAt: "desc" },
  });

  if (!call) {
    return NextResponse.json({ phase: "waiting", summary: null });
  }

  const terminal = ["COMPLETED", "NO_BOOKING", "MISSED"].includes(call.status);
  return NextResponse.json({
    phase: terminal ? "completed" : "in_progress",
    summary: call.summary ?? null,
  });
}
