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

  const session = await prisma.demoSession.findFirst({
    where: {
      expiresAt: { gt: new Date() },
      demoNumber: { number: normalized },
    },
    select: { businessId: true },
  });

  return session?.businessId ?? null;
}
