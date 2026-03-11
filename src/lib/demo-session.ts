import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";

/**
 * Given a called number (E.164 or any format), returns the businessId of the
 * business currently assigned a demo session on that number, or null if none.
 */
export async function resolveBusinessFromDemo(
  toNumber: string
): Promise<string | null> {
  const normalized = normalizePhoneNumber(toNumber);
  if (!normalized) return null;
  const now = new Date();

  const session = await prisma.demoSession.findFirst({
    where: {
      expiresAt: { gt: now },
      demoNumber: { number: normalized },
    },
    select: { businessId: true },
  });

  if (session?.businessId) {
    return session.businessId;
  }

  const publicDemoBusinessId = process.env.DEMO_BUSINESS_ID;
  if (!publicDemoBusinessId) {
    return null;
  }

  const demoNumber = await prisma.demoNumber.findUnique({
    where: { number: normalized },
    select: { id: true },
  });

  if (!demoNumber) {
    return null;
  }

  const publicAttempt = await prisma.publicDemoAttempt.findFirst({
    where: {
      demoNumberId: demoNumber.id,
      expiresAt: { gt: now },
    },
    select: { id: true },
  });

  return publicAttempt ? publicDemoBusinessId : null;
}
