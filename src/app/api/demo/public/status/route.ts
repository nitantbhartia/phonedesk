import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

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

  // Find any call for the demo business created after this session started
  const call = await prisma.call.findFirst({
    where: {
      businessId: demoBizId,
      createdAt: { gte: attempt.startedAt },
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
