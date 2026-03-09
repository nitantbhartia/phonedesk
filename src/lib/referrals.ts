import { randomBytes } from "crypto";
import type { Plan, ReferralStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { REFERRAL_COOKIE, REFERRAL_QUALIFYING_PLAN } from "@/lib/referral-constants";
const PRO_PLAN_ID: Plan = REFERRAL_QUALIFYING_PLAN;
const QUALIFYING_STATUSES = new Set(["active", "trialing"]);

export function normalizeReferralCode(value?: string | null) {
  const normalized = value?.trim().toUpperCase().replace(/[^A-Z0-9]/g, "") || "";
  return normalized || null;
}

function createReferralCode() {
  return randomBytes(4).toString("hex").toUpperCase();
}

export async function ensureBusinessReferralCode(businessId: string) {
  const existing = await prisma.business.findUnique({
    where: { id: businessId },
    select: { referralCode: true },
  });

  if (existing?.referralCode) {
    return existing.referralCode;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const referralCode = createReferralCode();
    try {
      const updated = await prisma.business.update({
        where: { id: businessId },
        data: { referralCode },
        select: { referralCode: true },
      });
      return updated.referralCode;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!message.includes("Unique constraint")) {
        throw error;
      }
    }
  }

  throw new Error("Failed to generate a unique referral code.");
}

export async function claimReferralForUser(userId: string, rawCode?: string | null) {
  const referralCode = normalizeReferralCode(rawCode);
  if (!referralCode) {
    return null;
  }

  const [user, referrerBusiness] = await Promise.all([
    prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        business: { select: { id: true } },
      },
    }),
    prisma.business.findUnique({
      where: { referralCode },
      select: { id: true, name: true, userId: true },
    }),
  ]);

  if (!user || !referrerBusiness) {
    return null;
  }

  if (user.business?.id) {
    return null;
  }

  if (user.id === referrerBusiness.userId || user.business?.id === referrerBusiness.id) {
    return null;
  }

  const existing = await prisma.referral.findUnique({
    where: { referredUserId: user.id },
    select: { id: true, referrerBusinessId: true, status: true },
  });

  if (existing?.referrerBusinessId === referrerBusiness.id) {
    return existing;
  }

  if (existing) {
    return existing;
  }

  return prisma.referral.create({
    data: {
      referrerBusinessId: referrerBusiness.id,
      referredUserId: user.id,
      status: "PENDING",
    },
    select: {
      id: true,
      referrerBusinessId: true,
      status: true,
    },
  });
}

export async function attachReferralToBusiness(userId: string, businessId: string) {
  const referral = await prisma.referral.findUnique({
    where: { referredUserId: userId },
    select: {
      id: true,
      referrerBusinessId: true,
      referredBusinessId: true,
      status: true,
    },
  });

  if (!referral || referral.referrerBusinessId === businessId) {
    return null;
  }

  if (referral.referredBusinessId === businessId && referral.status !== "PENDING") {
    return referral;
  }

  return prisma.referral.update({
    where: { id: referral.id },
    data: {
      referredBusinessId: businessId,
      status: "BUSINESS_CREATED",
    },
    select: {
      id: true,
      status: true,
      referrerBusinessId: true,
      referredBusinessId: true,
    },
  });
}

export async function updateReferralQualificationForBusiness(params: {
  businessId: string;
  plan: Plan;
  stripeSubscriptionStatus?: string | null;
}) {
  const { businessId, plan, stripeSubscriptionStatus } = params;
  const qualifies =
    plan === PRO_PLAN_ID &&
    Boolean(stripeSubscriptionStatus && QUALIFYING_STATUSES.has(stripeSubscriptionStatus));

  const referral = await prisma.referral.findUnique({
    where: { referredBusinessId: businessId },
    select: {
      id: true,
      status: true,
      qualifiedAt: true,
    },
  });

  if (!referral) {
    return null;
  }

  if (referral.qualifiedAt) {
    return referral;
  }

  const nextStatus: ReferralStatus = qualifies ? "QUALIFIED" : "BUSINESS_CREATED";
  const shouldUpdateQualifiedAt = qualifies && !referral.qualifiedAt;

  if (referral.status === nextStatus && !shouldUpdateQualifiedAt) {
    return referral;
  }

  return prisma.referral.update({
    where: { id: referral.id },
    data: {
      status: nextStatus,
      qualifiedAt: shouldUpdateQualifiedAt ? new Date() : referral.qualifiedAt,
    },
    select: {
      id: true,
      status: true,
      qualifiedAt: true,
    },
  });
}

export function buildReferralLink(appUrl: string, referralCode: string) {
  return `${appUrl}/auth?mode=signup&ref=${referralCode}`;
}

export { REFERRAL_COOKIE, REFERRAL_QUALIFYING_PLAN };
