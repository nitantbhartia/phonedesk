import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateRetellPhoneNumber } from "@/lib/retell";

// Force-expire stale demo sessions and public demo attempts so demo numbers
// are released back into the pool immediately.
export async function POST(req: NextRequest) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET is not configured" },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const now = new Date();

  // Expire all active private demo sessions
  const expiredSessions = await prisma.demoSession.updateMany({
    where: { expiresAt: { gt: now } },
    data: { expiresAt: now },
  });

  // Expire all active public demo attempts
  const expiredAttempts = await prisma.publicDemoAttempt.updateMany({
    where: { expiresAt: { gt: now } },
    data: { expiresAt: now },
  });

  // Clear inbound agents on all demo numbers so they don't accept calls
  // until a new session starts
  const demoNumbers = await prisma.demoNumber.findMany({
    select: { id: true, number: true, retellPhoneNumber: true },
  });

  const clearResults = await Promise.allSettled(
    demoNumbers.map((dn) =>
      updateRetellPhoneNumber(dn.retellPhoneNumber, { inboundAgentId: null })
    )
  );

  const cleared = clearResults.filter((r) => r.status === "fulfilled").length;

  return NextResponse.json({
    expiredSessions: expiredSessions.count,
    expiredAttempts: expiredAttempts.count,
    demoNumbersCleared: cleared,
    totalDemoNumbers: demoNumbers.length,
  });
}
