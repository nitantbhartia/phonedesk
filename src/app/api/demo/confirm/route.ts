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

  const magicToken = await prisma.demoMagicToken.findUnique({
    where: { token },
    include: { lead: true },
  });

  if (!magicToken) {
    return NextResponse.json({ error: "invalid_token" }, { status: 400 });
  }
  if (magicToken.usedAt) {
    return NextResponse.json({ error: "token_used" }, { status: 400 });
  }
  if (magicToken.expiresAt < now) {
    return NextResponse.json({ error: "token_expired" }, { status: 400 });
  }

  // Consume the token and mark the lead as verified atomically
  await prisma.$transaction([
    prisma.demoMagicToken.update({
      where: { id: magicToken.id },
      data: { usedAt: now },
    }),
    prisma.demoLead.update({
      where: { id: magicToken.leadId },
      data: {
        verifiedAt: magicToken.lead.verifiedAt ?? now,
      },
    }),
  ]);

  const ldt = issueDemoToken(magicToken.leadId);

  return NextResponse.json({ ldt });
}
