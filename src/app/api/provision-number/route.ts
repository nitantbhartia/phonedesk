import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import {
  deleteRetellPhoneNumber,
  provisionRetellPhoneNumber,
  syncRetellAgent,
} from "@/lib/retell";

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

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
    const provisioned = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtext(${business.id}))
      `;

      const existingPhoneNumber = await tx.phoneNumber.findUnique({
        where: { businessId: business.id },
      });

      if (existingPhoneNumber) {
        return {
          phoneNumber: existingPhoneNumber.number,
          alreadyProvisioned: true,
        };
      }

      const result = await provisionRetellPhoneNumber({
        agentId,
        areaCode,
        nickname: `${business.name} - RingPaw AI`,
        smsWebhookUrl: `${appUrl}/api/sms/webhook`,
      });

      if (!isProvisionedPhoneNumber(result?.phone_number)) {
        throw new Error("Retell returned an invalid phone number");
      }

      try {
        await tx.phoneNumber.create({
          data: {
            businessId: business.id,
            number: result.phone_number,
            retellPhoneNumber: result.phone_number,
            provider: "RETELL",
          },
        });
      } catch (error) {
        await deleteRetellPhoneNumber(result.phone_number).catch((cleanupError) => {
          console.error("Failed to clean up duplicate Retell number:", cleanupError);
        });
        throw error;
      }

      await tx.business.update({
        where: { id: business.id },
        data: { onboardingStep: 5 },
      });

      return {
        phoneNumber: result.phone_number,
        alreadyProvisioned: false,
      };
    });

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
