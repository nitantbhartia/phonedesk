"use client";

import { useEffect, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
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
        <div className="h-8 w-48 bg-slate-200 rounded animate-pulse" />
        <div className="h-48 bg-slate-200 rounded-lg animate-pulse" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Billing & Plan</h1>
        <p className="text-muted-foreground">Manage your subscription.</p>
      </div>

      {/* Current Plan Usage */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Current Plan: {activePlan.name}</CardTitle>
              <CardDescription>
                ${activePlan.price}/month
              </CardDescription>
            </div>
            <Badge variant={isAtLimit ? "destructive" : isNearLimit ? "warning" : "success"}>
              {Math.round(minutesUsed)} / {minuteLimit} min
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Monthly minutes used</span>
              <span>{Math.round(usagePercent)}%</span>
            </div>
            <Progress value={usagePercent} className="h-2" />
            {isAtLimit && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-3 mt-3">
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
              <p className="text-sm text-amber-600">
                Running low on minutes. Upgrade to {nextPlan.name} for {nextPlan.minutes} min/month.
              </p>
            )}
          </div>
        </CardContent>
      </Card>

      {/* Plan Comparison */}
      <div className="grid md:grid-cols-3 gap-6">
        {PLANS.map((plan) => (
          <Card
            key={plan.id}
            className={
              plan.id === currentPlan
                ? "border-primary ring-2 ring-primary/20"
                : plan.popular
                  ? "border-primary/50"
                  : ""
            }
          >
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>{plan.name}</CardTitle>
                {plan.id === currentPlan && (
                  <Badge>Current</Badge>
                )}
                {plan.popular && plan.id !== currentPlan && (
                  <Badge variant="outline">Popular</Badge>
                )}
              </div>
              <div>
                <span className="text-3xl font-bold">${plan.price}</span>
                <span className="text-muted-foreground">/mo</span>
              </div>
            </CardHeader>
            <CardContent>
              <ul className="space-y-2 mb-6">
                {plan.features.map((feature) => (
                  <li key={feature} className="flex items-start gap-2 text-sm">
                    <CheckCircle className="w-4 h-4 text-green-500 shrink-0 mt-0.5" />
                    {feature}
                  </li>
                ))}
              </ul>
              {plan.id === currentPlan ? (
                <Button variant="outline" className="w-full" disabled>
                  Current Plan
                </Button>
              ) : (
                <Button
                  variant={plan.popular ? "default" : "outline"}
                  className="w-full"
                >
                  {PLANS.indexOf(plan) > PLANS.findIndex((p) => p.id === currentPlan)
                    ? "Upgrade"
                    : "Downgrade"}
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Billing Info */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <CreditCard className="w-5 h-5" />
            Payment Method
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-8 text-muted-foreground">
            <CreditCard className="w-12 h-12 mx-auto mb-4 opacity-50" />
            <p className="font-medium">No payment method on file</p>
            <p className="text-sm mt-1">
              Add a payment method to activate your subscription.
            </p>
            <Button className="mt-4">
              <Zap className="w-4 h-4 mr-2" /> Add Payment Method
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
