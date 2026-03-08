"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { CheckCircle, CreditCard, Zap } from "lucide-react";

const PLANS = [
  {
    id: "STARTER",
    name: "Starter",
    price: 49,
    minutes: 50,
    calendars: 1,
    smsCommands: "Basic",
    features: [
      "50 minutes/month",
      "1 calendar connection",
      "Basic SMS commands",
      "Call transcripts",
      "SMS notifications",
    ],
  },
  {
    id: "PRO",
    name: "Growth",
    price: 149,
    minutes: 200,
    calendars: 3,
    smsCommands: "Full",
    popular: true,
    features: [
      "200 minutes/month",
      "3 calendar connections",
      "Full SMS command set",
      "Custom voice & personality",
      "Call analytics",
    ],
  },
  {
    id: "BUSINESS",
    name: "Pro",
    price: 299,
    minutes: 500,
    calendars: 5,
    smsCommands: "Full + API",
    features: [
      "500 minutes/month",
      "5 calendar connections",
      "Priority support",
      "Multi-location support",
      "Custom AI instructions",
    ],
  },
];

export default function BillingPage() {
  const { status } = useSession();
  const router = useRouter();
  const [currentPlan, setCurrentPlan] = useState("STARTER");
  const [minutesUsed, setMinutesUsed] = useState(0);
  const [hasStripeCustomer, setHasStripeCustomer] = useState(false);
  const [processingPlan, setProcessingPlan] = useState<string | null>(null);
  const [billingError, setBillingError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
      return;
    }
    if (status === "authenticated") fetchBillingData();
  }, [status, router]);

  async function fetchBillingData() {
    try {
      const res = await fetch("/api/business/profile");
      if (res.ok) {
        const data = await res.json();
        if (data.business) {
          setCurrentPlan(data.business.plan || "STARTER");
          setHasStripeCustomer(Boolean(data.business.stripeCustomerId));
        }
        if (data.stats) {
          setMinutesUsed(data.stats.totalCallMinutes || 0);
        }
      }
    } catch (error) {
      console.error("Error:", error);
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
        body: JSON.stringify({ plan: planId }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to start checkout");
      }
      if (!data.url) {
        throw new Error("Checkout URL missing");
      }
      window.location.href = data.url;
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Failed to start checkout");
      setProcessingPlan(null);
    }
  }

  async function openBillingPortal() {
    setBillingError("");
    try {
      const res = await fetch("/api/billing/portal", { method: "POST" });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to open billing portal");
      }
      if (!data.url) {
        throw new Error("Billing portal URL missing");
      }
      window.location.href = data.url;
    } catch (error) {
      setBillingError(error instanceof Error ? error.message : "Failed to open billing portal");
    }
  }

  const activePlan = PLANS.find((p) => p.id === currentPlan) || PLANS[0];
  const minuteLimit = activePlan.minutes;
  const usagePercent =
    minuteLimit > 0 ? Math.min((minutesUsed / minuteLimit) * 100, 100) : 0;
  const isAtLimit = usagePercent >= 100;
  const isNearLimit = usagePercent >= 80;
  const nextPlan = PLANS[PLANS.findIndex((p) => p.id === currentPlan) + 1];

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
        <p className="text-paw-brown/60 font-medium mt-1">Manage your subscription and Stripe billing details.</p>
      </div>

      {/* Current Plan Usage */}
      <section className="bg-white rounded-3xl shadow-card border border-white p-6 sm:p-8">
        <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-paw-brown">Current Plan: {activePlan.name}</h2>
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
            {Math.round(minutesUsed)} / {minuteLimit} min
          </span>
        </div>
        <div className="mt-6 space-y-2">
          <div className="flex justify-between text-sm font-medium text-paw-brown/70">
            <span>Monthly minutes used</span>
            <span>{Math.round(usagePercent)}%</span>
          </div>
          <div className="w-full h-2 rounded-full bg-paw-brown/10 overflow-hidden">
            <div
              className={`h-full transition-all ${
                isAtLimit ? "bg-red-500" : isNearLimit ? "bg-amber-500" : "bg-paw-amber"
              }`}
              style={{ width: `${usagePercent}%` }}
            />
          </div>
          {isAtLimit && (
            <div className="bg-red-50 border border-red-200 rounded-2xl p-4 mt-3">
              <p className="text-sm font-medium text-red-800">
                You&apos;ve used all your minutes for this month.
              </p>
              <p className="text-sm text-red-700 mt-1">
                New calls will go to voicemail until your plan resets.
                {nextPlan && (
                  <> Upgrade to <strong>{nextPlan.name}</strong> for {nextPlan.minutes} min/month.</>
                )}
              </p>
            </div>
          )}
          {isNearLimit && !isAtLimit && nextPlan && (
            <p className="text-sm text-amber-700 mt-2">
              Running low on minutes. Upgrade to {nextPlan.name} for {nextPlan.minutes} min/month.
            </p>
          )}
        </div>
      </section>

      {/* Plan Comparison */}
      <section className="grid md:grid-cols-3 gap-6">
        {PLANS.map((plan) => {
          const isCurrent = plan.id === currentPlan;
          const isUpgrade = PLANS.indexOf(plan) > PLANS.findIndex((p) => p.id === currentPlan);
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
                    Popular
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
                  onClick={() => void startCheckout(plan.id)}
                  disabled={processingPlan !== null}
                >
                  {processingPlan === plan.id ? "Redirecting..." : isUpgrade ? "Upgrade" : "Downgrade"}
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
              : "Choose a plan above to start Stripe checkout and add your payment method."}
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
