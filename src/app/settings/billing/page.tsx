"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { CheckCircle, CreditCard, Zap } from "lucide-react";

const PLANS = [
  {
    id: "STARTER",
    name: "Solo",
    price: 99,
    minutes: 120,
    features: [
      "120 minutes/month (~60 calls)",
      "Everything included",
      "Calendar integration",
    ],
  },
  {
    id: "PRO",
    name: "Studio",
    price: 199,
    minutes: 300,
    popular: true,
    features: [
      "300 minutes/month (~150 calls)",
      "Priority setup",
      "Square + Google Calendar",
    ],
  },
  {
    id: "BUSINESS",
    name: "Salon",
    price: 349,
    minutes: 500,
    features: [
      "500 minutes/month (~250 calls)",
      "Priority support",
      "Multi-groomer routing",
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
  const minutesLimit = usage?.minutesLimit ?? (PLANS.find((p) => p.id === currentPlan)?.minutes ?? 120);
  const percentUsed = usage?.percentUsed ?? 0;
  const isAtLimit = percentUsed >= 100;
  const isNearLimit = percentUsed >= 80 && !isAtLimit;
  if (loading) {
    return (
      <div className="space-y-6">
        <div className="h-10 w-64 bg-white/50 rounded-2xl animate-pulse" />
        <div className="h-56 bg-white/50 rounded-4xl animate-pulse" />
        <div className="h-72 bg-white/50 rounded-4xl animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-4xl font-extrabold text-paw-brown">Billing & Plan</h1>
        <p className="text-paw-brown/60 font-medium mt-1">View your plan, monthly usage, and payment method. Upgrade or cancel anytime.</p>
      </div>

      {/* Current Plan Usage */}
      <section className="bg-white rounded-3xl shadow-card border border-white p-6 sm:p-8">
        {subscriptionActive && activePlan ? (
          <>
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold text-paw-brown">
                  Current Plan: {activePlan.name}
                  {usage?.subscriptionStatus === "trialing" && (
                    <span className="ml-2 inline-flex items-center rounded-full bg-blue-100 px-2.5 py-1 text-xs font-bold text-blue-700">Trial</span>
                  )}
                </h2>
                <p className="text-paw-brown/60 font-medium mt-1">${activePlan.price}/month</p>
              </div>
              <span
                className={`inline-flex w-fit items-center rounded-full px-3 py-1 text-xs font-bold ${
                  isAtLimit
                    ? "bg-red-100 text-red-700"
                    : isNearLimit
                      ? "bg-amber-100 text-amber-700"
                      : "bg-green-100 text-green-700"
                }`}
              >
                {minutesUsed} / {minutesLimit} min
              </span>
            </div>
            <div className="mt-6 space-y-2">
              <div className="flex justify-between text-sm font-medium text-paw-brown/70">
                <span>Monthly minutes used</span>
                <span>{Math.min(percentUsed, 100)}%</span>
              </div>
              <div className="w-full h-2 rounded-full bg-paw-brown/10 overflow-hidden">
                <div
                  className={`h-full transition-all ${
                    isAtLimit ? "bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-paw-amber"
                  }`}
                  style={{ width: `${Math.min(percentUsed, 100)}%` }}
                />
              </div>
              {isAtLimit && (
                <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mt-3">
                  <p className="text-sm font-medium text-red-800">
                    You&apos;ve used all your minutes for this month.
                  </p>
                  {nextPlan && (
                    <p className="text-sm text-red-700 mt-1">
                      Upgrade to <strong>{nextPlan.name}</strong> for {nextPlan.minutes} min/month.
                    </p>
                  )}
                </div>
              )}
              {isNearLimit && nextPlan && (
                <p className="text-sm text-amber-700 mt-2">
                  Running low on minutes. Upgrade to {nextPlan.name} for {nextPlan.minutes} min/month.
                </p>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#d97706" strokeWidth="2.5">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
                <path d="M7 11V7a5 5 0 0 1 10 0v4" />
              </svg>
            </div>
            <div>
              <h2 className="text-2xl font-bold text-paw-brown">No active plan</h2>
              <p className="text-paw-brown/60 font-medium mt-1">Choose a plan below to activate your AI receptionist.</p>
            </div>
          </div>
        )}
      </section>

      {/* Plan Comparison */}
      <section className="grid md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const isCurrent = subscriptionActive && plan.id === currentPlan;
          const planIndex = PLANS.findIndex((p) => p.id === plan.id);
          const isUpgrade = subscriptionActive ? planIndex > currentPlanIndex : false;
          const isDowngrade = subscriptionActive ? planIndex < currentPlanIndex : false;
          return (
            <article
              key={plan.id}
              className={`rounded-3xl border p-6 sm:p-7 shadow-card ${
                isCurrent
                  ? "bg-white border-paw-amber ring-2 ring-paw-amber/40"
                  : plan.popular
                    ? "bg-paw-brown text-paw-cream border-paw-brown"
                    : "bg-white border-white"
              }`}
            >
              <div className="flex items-center justify-between mb-3">
                <h3 className={`text-xl font-bold ${plan.popular && !isCurrent ? "text-paw-amber" : "text-paw-brown"}`}>
                  {plan.name}
                </h3>
                {isCurrent ? (
                  <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-1 text-[11px] font-bold text-green-700">
                    Current
                  </span>
                ) : null}
                {plan.popular && !isCurrent ? (
                  <span className="inline-flex items-center rounded-full bg-paw-amber px-2.5 py-1 text-[11px] font-bold text-paw-brown">
                    Recommended
                  </span>
                ) : null}
              </div>
              <div className="mb-6">
                <span className={`text-4xl font-extrabold ${plan.popular && !isCurrent ? "text-white" : "text-paw-brown"}`}>
                  ${plan.price}
                </span>
                <span className={`${plan.popular && !isCurrent ? "text-white/70" : "text-paw-brown/60"}`}>/mo</span>
              </div>
              <ul className="space-y-2 mb-6">
                {plan.features.map((feature) => (
                  <li
                    key={feature}
                    className={`flex items-start gap-2 text-sm ${
                      plan.popular && !isCurrent ? "text-white/85" : "text-paw-brown/80"
                    }`}
                  >
                    <CheckCircle className={`w-4 h-4 shrink-0 mt-0.5 ${plan.popular && !isCurrent ? "text-paw-amber" : "text-green-500"}`} />
                    {feature}
                  </li>
                ))}
              </ul>
              {isCurrent ? (
                <button
                  className="w-full py-3 rounded-full border-2 border-paw-brown/20 text-paw-brown font-bold text-sm opacity-70 cursor-not-allowed"
                  disabled
                >
                  Current Plan
                </button>
              ) : (
                <button
                  className={`w-full py-3 rounded-full font-bold text-sm transition-colors disabled:opacity-60 ${
                    plan.popular
                      ? "bg-paw-amber text-paw-brown hover:bg-white"
                      : "border-2 border-paw-brown text-paw-brown hover:bg-paw-brown hover:text-white"
                  }`}
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
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 font-medium">
          {billingError}
        </div>
      ) : null}

      {/* Billing Info */}
      <section className="bg-white rounded-3xl shadow-card border border-white p-6 sm:p-8">
        <div className="flex items-center gap-2 mb-2">
          <CreditCard className="w-5 h-5 text-paw-brown" />
          <h2 className="text-xl font-bold text-paw-brown">Payment Method</h2>
        </div>
        <div className="text-center py-8 text-paw-brown/70">
          <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p className="font-medium text-paw-brown">
            {hasStripeCustomer ? "Manage your payment details" : "No payment method on file"}
          </p>
          <p className="text-sm mt-1">
            {hasStripeCustomer
              ? "Open Stripe customer portal to update payment method, invoices, and subscription."
              : "Choose a plan above to start your free trial and add your payment method."}
          </p>
          {hasStripeCustomer ? (
            <button
              className="mt-4 inline-flex items-center px-5 py-2.5 bg-paw-brown text-white rounded-full font-bold text-sm shadow-soft hover:bg-opacity-90 transition-colors"
              onClick={() => void openBillingPortal()}
            >
              <Zap className="w-4 h-4 mr-2" /> Open Billing Portal
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
