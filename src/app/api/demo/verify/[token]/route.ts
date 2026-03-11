import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/**
 * GET — safe link preview / email scanner landing.
 * Does NOT consume the token or change any state.
 * Redirects to the /demo/confirm page so the user clicks an explicit button.
 */
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

  // Validate the token is real and not already consumed — but do NOT update anything
  const magicToken = await prisma.demoMagicToken.findUnique({
    where: { token },
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

  // Hand off to the confirmation page — token not consumed yet
  return NextResponse.redirect(
    `${appUrl}/demo/confirm?t=${encodeURIComponent(token)}`
  );
}
