import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isValidBusinessEmail } from "@/lib/disposable-domains";
import { sendDemoMagicLink } from "@/lib/email";

const MAGIC_LINK_TTL_MS = 60 * 60 * 1000; // 1 hour
const COOLDOWN_DAYS = 7;

function getClientIp(req: NextRequest): string {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown"
  );
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const email: string = (body?.email ?? "").trim().toLowerCase();
  const businessName: string = (body?.businessName ?? "").trim();

  if (!email) {
    return NextResponse.json({ error: "email_required" }, { status: 400 });
  }

  if (!isValidBusinessEmail(email)) {
    return NextResponse.json(
      { error: "invalid_email", message: "Please use a valid business email address." },
      { status: 400 }
    );
  }

  const ip = getClientIp(req);
  const now = new Date();

  // Upsert the lead — one record per email
  const lead = await prisma.demoLead.upsert({
    where: { email },
    create: {
      email,
      businessName: businessName || null,
      ipAtCreation: ip,
    },
    update: {
      // Update business name if provided and not yet set
      ...(businessName && { businessName }),
    },
  });

  // If verified and within cooldown, block
  if (lead.verifiedAt && lead.cooldownUntil && lead.cooldownUntil > now) {
    const daysLeft = Math.ceil(
      (lead.cooldownUntil.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)
    );
    return NextResponse.json(
      {
        error: "cooldown_active",
        message: `You already tried the live demo recently. Try again in ${daysLeft} day${daysLeft === 1 ? "" : "s"}.`,
        cooldownUntil: lead.cooldownUntil.toISOString(),
      },
      { status: 429 }
    );
  }

  // Invalidate any existing unused tokens for this lead
  await prisma.demoMagicToken.updateMany({
    where: { leadId: lead.id, usedAt: null, expiresAt: { gt: now } },
    data: { expiresAt: now }, // expire them immediately
  });

  // Create new magic token
  const magicToken = await prisma.demoMagicToken.create({
    data: {
      leadId: lead.id,
      expiresAt: new Date(now.getTime() + MAGIC_LINK_TTL_MS),
    },
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  const magicLink = `${appUrl}/api/demo/verify/${magicToken.token}`;

  await sendDemoMagicLink({
    to: email,
    magicLink,
    businessName: businessName || undefined,
  });

  return NextResponse.json({ sent: true });
}
