import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueDemoToken } from "@/lib/demo-token";

/**
 * POST — user-initiated token consumption.
 * Called when the user explicitly clicks "Launch my demo" on /demo/confirm.
 * This is the only place the token is consumed and verifiedAt is set.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const token: string = body?.token ?? "";

  if (!token) {
    return NextResponse.json({ error: "token_required" }, { status: 400 });
  }

  const now = new Date();

  // Validate token exists and is not already expired before entering the tx
  const magicToken = await prisma.demoMagicToken.findUnique({
    where: { token },
    include: { lead: true },
  });

  if (!magicToken) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }
  if (magicToken.expiresAt < now) {
    return NextResponse.json({ error: "token_expired" }, { status: 400 });
  }
  // Note: we do NOT check usedAt here — that check happens atomically inside
  // the transaction below to prevent two concurrent requests from both
  // succeeding with the same token.

  // Atomically consume the token. updateMany with usedAt:null as a predicate
  // ensures exactly one concurrent request wins — the other gets count=0.
  const consumed = await prisma.$transaction(
    async (tx) => {
      const updated = await tx.demoMagicToken.updateMany({
        where: { id: magicToken.id, usedAt: null },
        data: { usedAt: now },
      });
      if (updated.count === 0) return false;
      await tx.demoLead.update({
        where: { id: magicToken.leadId },
        data: { verifiedAt: magicToken.lead.verifiedAt ?? now },
      });
      return true;
    },
    { isolationLevel: "Serializable" }
  );

  if (!consumed) {
    return NextResponse.json({ error: "token_used" }, { status: 400 });
  }

  const ldt = issueDemoToken(magicToken.leadId);

  return NextResponse.json({ ldt });
}
