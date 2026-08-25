import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { rateLimit } from "@/lib/rate-limit";
import {
  ensureTwilioWebhooks,
  purchaseTwilioPhoneNumber,
  releaseTwilioPhoneNumber,
} from "@/lib/twilio";

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
      breedRecommendations: { orderBy: { priority: "desc" } },
    },
  });

  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  // Require admin approval before provisioning a real number
  const stripeBypass = process.env.STRIPE_BYPASS === "true";
  const isApproved =
    stripeBypass ||
    business.adminApprovedGoLive;
  if (!isApproved) {
    return NextResponse.json(
      { error: "admin_approval_required" },
      { status: 403 }
    );
  }

  // Return existing number if already provisioned
  if (business.phoneNumber) {
    return NextResponse.json({
      phoneNumber: business.phoneNumber.number,
      alreadyProvisioned: true,
    });
  }

  try {
    // Check again before buying a number in case another request completed
    // between the initial business lookup and this external call.
    const existingPhoneNumber = await prisma.phoneNumber.findUnique({
      where: { businessId: business.id },
    });

    if (existingPhoneNumber) {
      return NextResponse.json({
        phoneNumber: existingPhoneNumber.number,
        alreadyProvisioned: true,
      });
    }

    // Buy and configure the Twilio number outside the transaction to avoid
    // holding a database transaction open during network calls.
    const result = await purchaseTwilioPhoneNumber({ areaCode });

    if (!isProvisionedPhoneNumber(result.phoneNumber)) {
      throw new Error("Twilio returned an invalid phone number");
    }

    // The create request configures the new number, and this idempotent
    // reconciliation makes sure all required webhooks are applied.
    await ensureTwilioWebhooks(result.phoneNumber);

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
          // Another request already provisioned a number; release the one we
          // just bought so it does not remain billed and unassigned.
          await releaseTwilioPhoneNumber(result.sid).catch((e) => {
            console.error("Failed to clean up extra Twilio number:", e);
          });
          return { phoneNumber: existing.number, alreadyProvisioned: true };
        }

        await tx.phoneNumber.create({
          data: {
            businessId: business.id,
            number: result.phoneNumber,
            twilioPhoneNumberSid: result.sid,
            provider: "TWILIO",
            isActive: true,
          },
        });

        await tx.business.update({
          where: { id: business.id },
          data: { onboardingStep: 5 },
        });

        return { phoneNumber: result.phoneNumber, alreadyProvisioned: false };
      });
    } catch (error) {
      // DB write failed — clean up the Twilio number we already bought.
      await releaseTwilioPhoneNumber(result.sid).catch((cleanupError) => {
        console.error("Failed to clean up Twilio number after DB error:", cleanupError);
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
            : "Failed to provision phone number. Check Twilio configuration.",
      },
      { status: 500 }
    );
  }
}
