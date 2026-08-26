"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { CheckCircle, CreditCard, Zap } from "lucide-react";
import { RINGPAW_ESTIMATED_CALLS, RINGPAW_PLAN_MINUTES, RINGPAW_PLAN_PRICE } from "@/lib/billing-plans";

const PLANS = [
  {
    id: "PRO",
    name: "RingPaw",
    price: RINGPAW_PLAN_PRICE,
    minutes: RINGPAW_PLAN_MINUTES,
    popular: true,
    features: [
      `${RINGPAW_PLAN_MINUTES} minutes/month (~${RINGPAW_ESTIMATED_CALLS} two-minute calls)`,
      "One location, one line",
      "Missed-call booking for pet groomers",
      "Google Calendar + Square support",
      "Owner + caller SMS confirmations",
    ],
  },
];

interface UsageData {
  minutesUsed: number;
  minutesLimit: number;
  minutesRemaining: number;
  overageMinutes: number;
  percentUsed: number;
  plan: string;
  planName: string;
  subscriptionStatus: string | null;
  periodStart: string;
}

export default function BillingPage() {
  const { status } = useSession();
  const router = useRouter();
  const [usage, setUsage] = useState<UsageData | null>(null);
  const [hasStripeCustomer, setHasStripeCustomer] = useState(false);
  const [stripeSubscriptionId, setStripeSubscriptionId] = useState<string | null>(null);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const [billingError, setBillingError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") void fetchBillingData();
  }, [status, router]);

  async function fetchBillingData() {
    try {
      const [profileRes, usageRes] = await Promise.all([
        fetch("/api/business/profile"),
        fetch("/api/billing/usage"),
      ]);

      if (profileRes.ok) {
        const data = await profileRes.json();
        if (data.business) {
          setHasStripeCustomer(Boolean(data.business.stripeCustomerId));
          setStripeSubscriptionId(data.business.stripeSubscriptionId ?? null);
        }
      }

      if (usageRes.ok) {
        const data = await usageRes.json();
        setUsage(data);
      }
    } catch {
      setBillingError("Failed to load billing data. Please refresh.");
    } finally {
      setLoading(false);
    }
  }

  async function startCheckout(planId: string) {
    setBillingError("");
    setProcessingPlan(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: planId,
          successUrl: "/dashboard?subscribed=true",
          cancelUrl: "/settings/billing",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to start checkout");
      if (!data.url) throw new Error("Checkout URL missing");
      window.location.href = data.url;
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Failed to start checkout");
      setProcessingPlan(null);
    }
  }

  async function upgradePlan(planId: string) {
    setBillingError("");
    setProcessingPlan(planId);
    try {
      const res = await fetch("/api/billing/upgrade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to upgrade plan");
      // Refresh usage data after upgrade
      await fetchBillingData();
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Failed to upgrade plan");
    } finally {
      setProcessingPlan(null);
    }
  }

  async function openBillingPortal() {
    setBillingError("");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to open billing portal");
      if (!data.url) throw new Error("Billing portal URL missing");
      window.location.href = data.url;
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Failed to open billing portal");
    }
  }

  const subscriptionActive = ["active", "trialing"].includes(usage?.subscriptionStatus ?? "");
  const currentPlan = usage?.plan ?? "STARTER";
  const currentPlanIndex = PLANS.findIndex((p) => p.id === currentPlan);
  const activePlan = subscriptionActive ? (PLANS.find((p) => p.id === currentPlan) || PLANS[0]) : null;
  const nextPlan = activePlan && currentPlanIndex < PLANS.length - 1 ? PLANS[currentPlanIndex + 1] : null;
  const minutesUsed = usage?.minutesUsed ?? 0;
  const minutesLimit = usage?.minutesLimit ?? (PLANS.find((p) => p.id === currentPlan)?.minutes ?? 75);
  const percentUsed = usage?.percentUsed ?? 0;
  const isAtLimit = percentUsed >= 100;
  const isNearLimit = percentUsed >= 80 && !isAtLimit;
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 bg-surface rounded-sm animate-pulse" />
        <div className="h-56 bg-surface rounded-sm animate-pulse" />
        <div className="h-72 bg-surface rounded-sm animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-10">
      <div>
        <h1 className="font-display text-[2.35rem] tracking-tight text-ink">Plan &amp; billing</h1>
        <p className="mt-1 text-[14px] text-muted">One line, one location, ${RINGPAW_PLAN_PRICE} a month — about {RINGPAW_ESTIMATED_CALLS} two-minute calls included.</p>
      </div>

      {/* Current Plan Usage */}
      <section className="bg-surface rounded-sm border border-line p-6 sm:p-8">
        {subscriptionActive && activePlan ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h2 className="font-display text-2xl text-ink">
                  {activePlan.name} plan
                  {usage?.subscriptionStatus === "trialing" && (
                    <span className="ml-2 inline-flex items-center rounded-sm bg-paper px-2.5 py-1 text-xs font-bold text-ink">Trial</span>
                  )}
                </h2>
                <p className="text-muted font-medium mt-1">${activePlan.price}/month</p>
              </div>
              <span
                className={`inline-flex w-fit items-center rounded-sm px-3 py-1 text-xs font-bold ${
                  isAtLimit
                  ? "bg-paper text-accent"
                  : isNearLimit
                  ? "bg-paper text-ink"
                  : "bg-paper text-ink"
                }`}
              >
                {minutesUsed} / {minutesLimit} min
              </span>
            </div>
            <div className="mt-6 space-y-2">
              <div className="flex justify-between text-sm font-medium text-muted">
                <span>Monthly minutes used</span>
                <span>{Math.min(percentUsed, 100)}%</span>
              </div>
              <div className="w-full h-2 rounded-sm bg-ink/5 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    isAtLimit ? "bg-ink" : isNearLimit ? "bg-ink" : "bg-line"
                  }`}
                  style={{ width: `${Math.min(percentUsed, 100)}%` }}
                />
              </div>
              {isAtLimit && (
                <div className="bg-paper border border-line rounded-sm p-4 mt-3">
                  <p className="text-sm font-medium text-ink">
                    You&apos;ve used all your minutes for this month.
                  </p>
                  {nextPlan && (
                    <p className="text-sm text-accent mt-1">
                      Upgrade to <strong>{nextPlan.name}</strong> for {nextPlan.minutes} min/month.
                    </p>
                  )}
                </div>
              )}
              {isNearLimit && nextPlan && (
                <p className="text-sm text-ink mt-2">
                  Running low on minutes. Upgrade to {nextPlan.name} for {nextPlan.minutes} min/month.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-10 h-10 rounded-sm bg-paper flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" className="text-ink" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-ink">No active plan</h2>
              <p className="text-muted font-medium mt-1">${RINGPAW_PLAN_PRICE}/mo — one location, one line, {RINGPAW_PLAN_MINUTES} minutes included. Set STRIPE_PRO_PRICE_ID in env for live checkout.</p>
            </div>
          </div>
        )}
      </section>

      {/* Plan Comparison */}
      <section className="max-w-md mx-auto">
        {PLANS.map((plan) => {
          const isCurrent = subscriptionActive && plan.id === currentPlan;
          const planIndex = PLANS.findIndex((p) => p.id === plan.id);
          const isUpgrade = subscriptionActive ? planIndex > currentPlanIndex : false;
          const isDowngrade = subscriptionActive ? planIndex < currentPlanIndex : false;
          return (
            <article
              key={plan.id}
              className="border border-line bg-surface p-6 sm:p-7"
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className="font-display text-2xl text-ink">
                  {plan.name}
                </h3>
                {isCurrent ? (
                  <span className="inline-flex items-center rounded-sm bg-paper px-2.5 py-1 text-[11px] font-bold text-ink">
                    Current
                  </span>
                ) : null}
                {plan.popular && !isCurrent ? (
                  <span className="inline-flex items-center rounded-sm bg-line px-2.5 py-1 text-[11px] font-bold text-ink">
                    Recommended
                  </span>
                ) : null}
              </div>
              <div className="mb-6">
                <span className="font-display text-4xl text-ink">
                  ${plan.price}
                </span>
                <span className="text-muted">/mo</span>
              </div>
              <ul className="space-y-2 mb-6">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className="flex items-start gap-2 text-sm text-ink/80"
                  >
                    <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                    {feature}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button
                  className="w-full py-3 rounded-sm border-2 border-line text-ink font-bold text-sm opacity-70 cursor-not-allowed"
                  disabled
                >
                  Current Plan
                </button>
              ) : (
                <button
                  className="w-full bg-ink py-3 text-sm text-surface transition-colors hover:bg-accent disabled:opacity-60"
                  onClick={() => {
                    if (subscriptionActive && stripeSubscriptionId) {
                      void upgradePlan(plan.id);
                    } else {
                      void startCheckout(plan.id);
                    }
                  }}
                  disabled={processingPlan !== null}
                >
                  {processingPlan === plan.id
                    ? "Updating..."
                    : !subscriptionActive
                      ? "Start Free Trial"
                      : isUpgrade
                        ? "Upgrade"
                        : isDowngrade
                          ? "Downgrade"
                          : "Switch"}
                </button>
              )}
            </article>
          );
        })}
      </section>

      {billingError ? (
        <div className="rounded-sm border border-line bg-paper px-4 py-3 text-sm text-accent font-medium">
          {billingError}
        </div>
      ) : null}

      {/* Billing Info — only shown when Stripe customer exists */}
      {hasStripeCustomer && (
        <section className="bg-surface rounded-sm border border-line p-6 sm:p-8">
          <div className="flex items-center gap-2 mb-2">
            <CreditCard className="w-5 h-5 text-ink" />
            <h2 className="text-xl font-bold text-ink">Payment Method</h2>
          </div>
          <div className="text-center py-8 text-muted">
            <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium text-ink">Manage your payment details</p>
            <p className="text-sm mt-1">
              Open Stripe customer portal to update payment method, invoices, and subscription.
            </p>
            <button
              className="mt-4 inline-flex items-center px-5 py-2.5 bg-ink text-white rounded-sm font-medium text-sm hover:bg-opacity-90 transition-colors"
              onClick={() => void openBillingPortal()}
            >
              <Zap className="w-4 h-4 mr-2" /> Open Billing Portal
            </button>
          </div>
        </section>
      )}
    </div>
  );
}
