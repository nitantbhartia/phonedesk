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
    price: 149,
    calls: 100,
    calendars: 1,
    smsCommands: "Basic",
    features: [
      "Up to 100 calls/month",
      "1 calendar connection",
      "Basic SMS commands (block/resume)",
      "Call transcripts",
      "SMS notifications",
    ],
  },
  {
    id: "PRO",
    name: "Pro",
    price: 249,
    calls: 300,
    calendars: 3,
    smsCommands: "Full",
    popular: true,
    features: [
      "Up to 300 calls/month",
      "3 calendar connections",
      "Full SMS command set",
      "Priority support",
      "Call analytics",
    ],
  },
  {
    id: "BUSINESS",
    name: "Business",
    price: 399,
    calls: -1,
    calendars: 5,
    smsCommands: "Full + API",
    features: [
      "Unlimited calls",
      "5 calendar connections",
      "Full SMS + API access",
      "Multi-location support",
      "White-label options",
    ],
  },
];

export default function BillingPage() {
  const { status } = useSession();
  const router = useRouter();
  const [currentPlan, setCurrentPlan] = useState("STARTER");
  const [callsUsed, setCallsUsed] = useState(0);
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
          setCallsUsed(data.stats.callsThisMonth || 0);
        }
      }
    } catch (error) {
      console.error("Error:", error);
    } finally {
      setLoading(false);
    }
  }

  const activePlan = PLANS.find((p) => p.id === currentPlan) || PLANS[0];
  const callLimit = activePlan.calls;
  const usagePercent =
    callLimit > 0 ? Math.min((callsUsed / callLimit) * 100, 100) : 0;

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
            <Badge variant={usagePercent > 80 ? "warning" : "success"}>
              {callsUsed} / {callLimit > 0 ? callLimit : "Unlimited"} calls
            </Badge>
          </div>
        </CardHeader>
        <CardContent>
          {callLimit > 0 && (
            <div className="space-y-2">
              <div className="flex justify-between text-sm">
                <span>Monthly call usage</span>
                <span>{Math.round(usagePercent)}%</span>
              </div>
              <Progress value={usagePercent} className="h-2" />
              {usagePercent > 80 && (
                <p className="text-sm text-amber-600">
                  Approaching your call limit. Overage is $0.10/call.
                </p>
              )}
            </div>
          )}
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
