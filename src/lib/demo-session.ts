import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";

export type DemoResolution =
  | {
      businessId: string;
      source: "private";
      demoNumberId: string;
      expired?: false;
    }
  | {
      businessId: string;
      source: "public";
      demoNumberId: string;
      publicAttemptId: string;
      leadId: string | null;
      callerPhone: string | null;
      /** True when matched via grace-period fallback (session already expired). */
      expired?: boolean;
    };

/**
 * Given a called number (E.164 or any format), returns the businessId of the
 * business currently assigned a demo session on that number, or null if none.
 *
 * Pass `fromNumber` so that expired sessions can still be matched when the
 * caller's phone was already recorded on the attempt (e.g. a second call after
 * the 30-minute session TTL elapsed).
 */
export async function resolveDemoSession(
  toNumber: string,
  fromNumber?: string
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

  // Prefer an active (unexpired) attempt first.
  const publicAttempt = await prisma.publicDemoAttempt.findFirst({
    where: {
      demoNumberId: demoNumber.id,
      expiresAt: { gt: now },
    },
    orderBy: { startedAt: "desc" },
    select: { id: true, leadId: true, callerPhone: true },
  });

  if (publicAttempt) {
    return {
      businessId: publicDemoBusinessId,
      source: "public",
      demoNumberId: demoNumber.id,
      publicAttemptId: publicAttempt.id,
      leadId: publicAttempt.leadId,
      callerPhone: publicAttempt.callerPhone,
    };
  }

  // Grace-period fallback: if the session just expired but we know this
  // caller's phone (set when their first call started), re-recognise the call
  // so the summary is still captured.  We only match on a known callerPhone to
  // avoid accidentally routing an unrelated caller to a stale session.
  const normalizedCaller = fromNumber ? normalizePhoneNumber(fromNumber) : null;
  if (normalizedCaller) {
    const GRACE_MS = 4 * 60 * 60 * 1000; // 4 hours
    const graceStart = new Date(now.getTime() - GRACE_MS);
    const expiredAttempt = await prisma.publicDemoAttempt.findFirst({
      where: {
        demoNumberId: demoNumber.id,
        callerPhone: normalizedCaller,
        expiresAt: { lte: now, gte: graceStart },
      },
      orderBy: { startedAt: "desc" },
      select: { id: true, leadId: true, callerPhone: true },
    });

    if (expiredAttempt) {
      return {
        businessId: publicDemoBusinessId,
        source: "public",
        demoNumberId: demoNumber.id,
        publicAttemptId: expiredAttempt.id,
        leadId: expiredAttempt.leadId,
        callerPhone: expiredAttempt.callerPhone,
        expired: true,
      };
    }
  }

  return null;
}

export async function resolveBusinessFromDemo(
  toNumber: string
): Promise<string | null> {
  const resolution = await resolveDemoSession(toNumber);
  return resolution?.businessId ?? null;
}
