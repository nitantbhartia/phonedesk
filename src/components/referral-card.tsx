"use client";

import { useState } from "react";

type ReferralEntry = {
  id: string;
  status: "PENDING" | "BUSINESS_CREATED" | "QUALIFIED";
  rewardCents: number;
  qualifiedAt?: string | Date | null;
  referredBusiness?: {
    id: string;
    name: string;
    plan: string;
  } | null;
  referredUser?: {
    email?: string | null;
    name?: string | null;
  } | null;
};

type ReferralSummary = {
  code: string;
  link: string;
  rewardAmount: number;
  rewardPlan: string;
  referrals: ReferralEntry[];
};

function getReferralLabel(entry: ReferralEntry) {
  if (entry.referredBusiness?.name) {
    return entry.referredBusiness.name;
  }
  if (entry.referredUser?.name) {
    return entry.referredUser.name;
  }
  if (entry.referredUser?.email) {
    return entry.referredUser.email;
  }
  return "New referral";
}

function getReferralStatus(entry: ReferralEntry) {
  if (entry.status === "QUALIFIED") {
    return {
      label: "Earned",
      tone: "bg-green-100 text-green-700",
      copy: `$${entry.rewardCents / 100} reward unlocked`,
    };
  }

  if (entry.status === "BUSINESS_CREATED") {
    return {
      label: "In progress",
      tone: "bg-amber-100 text-amber-700",
      copy: "Waiting for Small Shop plan",
    };
  }

  return {
    label: "Pending",
    tone: "bg-paw-sky text-paw-brown/70",
    copy: "Link claimed, account not finished",
  };
}

export function ReferralCard({
  referral,
  title = "Refer another groomer",
  compact = false,
}: {
  referral: ReferralSummary;
  title?: string;
  compact?: boolean;
}) {
  const [copied, setCopied] = useState(false);

  async function copyLink() {
    try {
      await navigator.clipboard.writeText(referral.link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="rounded-3xl border border-paw-brown/10 bg-white p-6 shadow-card">
      <div className={`flex ${compact ? "flex-col gap-4" : "flex-col gap-5 lg:flex-row lg:items-start lg:justify-between"}`}>
        <div className="max-w-xl">
          <p className="text-xs font-bold uppercase tracking-[0.2em] text-paw-brown/45">
            Referral program
          </p>
          <h2 className="mt-2 text-2xl font-extrabold text-paw-brown">{title}</h2>
          <p className="mt-2 text-sm leading-7 text-paw-brown/70">
            Share your link. You earn <strong>$50</strong> only when the referred shop starts the
            <strong> Small Shop ($149/mo)</strong> plan.
          </p>
        </div>

        <div className="flex w-full max-w-xl flex-col gap-3 lg:items-end">
          <div className="w-full rounded-2xl border border-paw-brown/10 bg-paw-sky/30 px-4 py-3 text-sm font-medium text-paw-brown">
            {referral.link}
          </div>
          <div className="flex w-full flex-col gap-3 sm:flex-row lg:justify-end">
            <div className="rounded-2xl border border-paw-brown/10 bg-paw-cream px-4 py-3 text-center text-sm font-bold text-paw-brown">
              Code: {referral.code}
            </div>
            <button
              type="button"
              onClick={copyLink}
              className="rounded-2xl bg-paw-brown px-5 py-3 text-sm font-bold text-paw-cream transition hover:bg-opacity-90"
            >
              {copied ? "Copied" : "Copy link"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-2xl bg-paw-amber/10 px-4 py-4">
          <div className="text-xs font-bold uppercase tracking-widest text-paw-brown/45">Reward</div>
          <div className="mt-2 text-2xl font-extrabold text-paw-brown">${referral.rewardAmount}</div>
        </div>
        <div className="rounded-2xl bg-paw-sky/30 px-4 py-4">
          <div className="text-xs font-bold uppercase tracking-widest text-paw-brown/45">Qualifies on</div>
          <div className="mt-2 text-xl font-extrabold text-paw-brown">Small Shop</div>
        </div>
        <div className="rounded-2xl bg-white border border-paw-brown/10 px-4 py-4">
          <div className="text-xs font-bold uppercase tracking-widest text-paw-brown/45">Successful referrals</div>
          <div className="mt-2 text-2xl font-extrabold text-paw-brown">
            {referral.referrals.filter((item) => item.status === "QUALIFIED").length}
          </div>
        </div>
      </div>

      {referral.referrals.length > 0 ? (
        <div className="mt-6 space-y-3">
          {referral.referrals.slice(0, compact ? 2 : 5).map((entry) => {
            const status = getReferralStatus(entry);
            return (
              <div
                key={entry.id}
                className="flex flex-col gap-3 rounded-2xl border border-paw-brown/10 px-4 py-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <p className="font-bold text-paw-brown">{getReferralLabel(entry)}</p>
                  <p className="text-sm text-paw-brown/60">{status.copy}</p>
                </div>
                <span className={`inline-flex w-fit rounded-full px-3 py-1 text-xs font-bold ${status.tone}`}>
                  {status.label}
                </span>
              </div>
            );
          })}
        </div>
      ) : null}
    </section>
  );
}
