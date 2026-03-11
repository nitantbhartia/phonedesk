import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { issueDemoToken } from "@/lib/demo-token";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";

  if (!token) {
    return NextResponse.redirect(`${appUrl}/demo?error=invalid_token`);
  }

  const now = new Date();

  const magicToken = await prisma.demoMagicToken.findUnique({
    where: { token },
    include: { lead: true },
  });

  if (!magicToken) {
    return NextResponse.redirect(`${appUrl}/demo?error=invalid_token`);
  }

  if (magicToken.usedAt) {
    return NextResponse.redirect(`${appUrl}/demo?error=token_used`);
  }

  if (magicToken.expiresAt < now) {
    return NextResponse.redirect(`${appUrl}/demo?error=token_expired`);
  }

  // Mark token as used and mark lead as verified (if not already)
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

  // Issue a signed short-lived token containing the leadId
  const ldt = issueDemoToken(magicToken.leadId);

  return NextResponse.redirect(`${appUrl}/demo?ldt=${encodeURIComponent(ldt)}`);
}
