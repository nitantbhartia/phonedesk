import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";

export type DemoResolution =
  | {
      businessId: string;
      source: "private";
      demoNumberId: string;
    }
  | {
      businessId: string;
      source: "public";
      demoNumberId: string;
      publicAttemptId: string;
      leadId: string | null;
      callerPhone: string | null;
    };

/**
 * Given a called number (E.164 or any format), returns the businessId of the
 * business currently assigned a demo session on that number, or null if none.
 */
export async function resolveDemoSession(
  toNumber: string
): Promise<DemoResolution | null> {
  const normalized = normalizePhoneNumber(toNumber);
  if (!normalized) return null;
  const now = new Date();

  const demoNumber = await prisma.demoNumber.findUnique({
    where: { number: normalized },
    select: { id: true },
  });

  if (!demoNumber) {
    return null;
  }

  const session = await prisma.demoSession.findFirst({
    where: {
      expiresAt: { gt: now },
      demoNumberId: demoNumber.id,
    },
    select: { businessId: true },
  });

  if (session?.businessId) {
    return {
      businessId: session.businessId,
      source: "private",
      demoNumberId: demoNumber.id,
    };
  }

  const publicDemoBusinessId = process.env.DEMO_BUSINESS_ID;
  if (!publicDemoBusinessId) {
    return null;
  }

  const publicAttempt = await prisma.publicDemoAttempt.findFirst({
    where: {
      demoNumberId: demoNumber.id,
      expiresAt: { gt: now },
    },
    orderBy: { startedAt: "desc" },
    select: { id: true, leadId: true, callerPhone: true },
  });

  if (!publicAttempt) {
    return null;
  }

  return {
    businessId: publicDemoBusinessId,
    source: "public",
    demoNumberId: demoNumber.id,
    publicAttemptId: publicAttempt.id,
    leadId: publicAttempt.leadId,
    callerPhone: publicAttempt.callerPhone,
  };
}

export async function resolveBusinessFromDemo(
  toNumber: string
): Promise<string | null> {
  const resolution = await resolveDemoSession(toNumber);
  return resolution?.businessId ?? null;
}
