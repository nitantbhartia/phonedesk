import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { rateLimit } from "@/lib/rate-limit";
import {
  deleteRetellPhoneNumber,
  provisionRetellPhoneNumber,
  syncRetellAgent,
} from "@/lib/retell";
import { buildRetellWebhookUrl } from "@/lib/retell-auth";

async function resolveUserId(session: {
  user?: {
    id?: string | null;
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}) {
  const email = session.user?.email;

  if (!email) {
    return session.user?.id ?? null;
  }

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: session.user?.name ?? undefined,
      image: session.user?.image ?? undefined,
    },
    update: {
      name: session.user?.name ?? undefined,
      image: session.user?.image ?? undefined,
    },
  });

  return user.id;
}

function isProvisionedPhoneNumber(value: unknown): value is string {
  return typeof value === "string" && /^\+\d{10,15}$/.test(value);
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions);
  const userId = session ? await resolveUserId(session) : null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Rate limit: 3 provision attempts per 5 minutes per user
  const { allowed } = rateLimit(`provision:${userId}`, { limit: 3, windowMs: 300_000 });
  if (!allowed) {
    return NextResponse.json({ error: "Too many attempts. Please wait a few minutes." }, { status: 429 });
  }

  const body = await req.json().catch(() => ({}));
  const requestedAreaCode = Number(body.areaCode);
  const areaCode =
    Number.isInteger(requestedAreaCode) &&
    requestedAreaCode >= 200 &&
    requestedAreaCode <= 999
      ? requestedAreaCode
      : undefined;

  const business = await prisma.business.findUnique({
    where: { userId },
    include: {
      phoneNumber: true,
      services: { where: { isActive: true } },
      retellConfig: true,
      breedRecommendations: { orderBy: { priority: "desc" } },
    },
  });

  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  // Return existing number if already provisioned
  if (business.phoneNumber) {
    return NextResponse.json({
      phoneNumber: business.phoneNumber.number,
      alreadyProvisioned: true,
    });
  }

  try {
    // Ensure we have a Retell agent first
    let agentId = business.retellConfig?.agentId;

    if (!agentId) {
      const synced = await syncRetellAgent(business);
      agentId = synced.agentId || undefined;
    }

    if (!agentId) {
      throw new Error("Retell agent could not be created");
    }

    // Check for existing number before calling Retell
    const existingPhoneNumber = await prisma.phoneNumber.findUnique({
      where: { businessId: business.id },
    });

    if (existingPhoneNumber) {
      return NextResponse.json({
        phoneNumber: existingPhoneNumber.number,
        alreadyProvisioned: true,
      });
    }

    // Call Retell outside the transaction to avoid timeout
    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const result = await provisionRetellPhoneNumber({
      agentId,
      areaCode,
      nickname: `${business.name} - RingPaw`,
      smsWebhookUrl: buildRetellWebhookUrl(appUrl, "/api/sms/webhook"),
    });

    if (!isProvisionedPhoneNumber(result?.phone_number)) {
      throw new Error("Retell returned an invalid phone number");
    }

    // Save to DB in a short transaction (no external calls inside)
    let provisioned: { phoneNumber: string; alreadyProvisioned: boolean };
    try {
      provisioned = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        await tx.$executeRaw`
          SELECT pg_advisory_xact_lock(hashtext(${business.id}))
        `;

        // Double-check under the lock in case of concurrent requests
        const existing = await tx.phoneNumber.findUnique({
          where: { businessId: business.id },
        });

        if (existing) {
          // Another request already provisioned a number; clean up the one we just created
          await deleteRetellPhoneNumber(result.phone_number).catch((e) => {
            console.error("Failed to clean up extra Retell number:", e);
          });
          return { phoneNumber: existing.number, alreadyProvisioned: true };
        }

        await tx.phoneNumber.create({
          data: {
            businessId: business.id,
            number: result.phone_number,
            retellPhoneNumber: result.phone_number,
            provider: "RETELL",
          },
        });

        await tx.business.update({
          where: { id: business.id },
          data: { onboardingStep: 5 },
        });

        return { phoneNumber: result.phone_number, alreadyProvisioned: false };
      });
    } catch (error) {
      // DB write failed — clean up the Retell number we already created
      await deleteRetellPhoneNumber(result.phone_number).catch((cleanupError) => {
        console.error("Failed to clean up Retell number after DB error:", cleanupError);
      });
      throw error;
    }

    return NextResponse.json({
      phoneNumber: provisioned.phoneNumber,
      alreadyProvisioned: provisioned.alreadyProvisioned,
    });
  } catch (error) {
    console.error("Error provisioning number:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to provision phone number. Check Retell configuration.",
      },
      { status: 500 }
    );
  }
}
