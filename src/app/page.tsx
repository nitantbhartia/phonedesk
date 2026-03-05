"use client";

import { signIn, useSession } from "next-auth/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Phone,
  Calendar,
  MessageSquare,
  Zap,
  CheckCircle,
  ArrowRight,
} from "lucide-react";

export default function LandingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [authError, setAuthError] = useState("");
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [isResolvingRedirect, setIsResolvingRedirect] = useState(false);

  useEffect(() => {
    if (!session) return;

    let cancelled = false;

    const resolvePostAuthRoute = async () => {
      setIsResolvingRedirect(true);

      const requestedCallback = searchParams.get("callbackUrl");
      if (requestedCallback?.includes("/onboarding")) {
        router.push("/onboarding");
        setIsResolvingRedirect(false);
        return;
      }

      try {
        const response = await fetch("/api/business/profile");
        if (!response.ok) {
          throw new Error("Failed to load business profile");
        }

        const data = await response.json();
        const onboardingComplete = Boolean(data.business?.onboardingComplete);

        if (!cancelled) {
          router.push(onboardingComplete ? "/dashboard" : "/onboarding");
        }
      } catch {
        if (!cancelled) {
          router.push("/onboarding");
        }
      } finally {
        if (!cancelled) {
          setIsResolvingRedirect(false);
        }
      }
    };

    void resolvePostAuthRoute();

    return () => {
      cancelled = true;
    };
  }, [session, router, searchParams]);

  const handleStartTrial = async () => {
    setAuthError("");
    setIsSigningIn(true);
    const callbackUrl =
      typeof window === "undefined"
        ? "/onboarding"
        : `${window.location.origin}/onboarding`;

    try {
      const result = await signIn("google", {
        callbackUrl,
        redirect: true,
      });

      if (result?.error) {
        setAuthError("Google sign-in is not configured correctly yet.");
        setIsSigningIn(false);
      }
    } catch {
      setAuthError("Google sign-in failed. Check your Railway auth variables.");
      setIsSigningIn(false);
    }
  };

  if (status === "loading" || isResolvingRedirect) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-pulse text-muted-foreground">Loading...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-sky-50 to-white">
      {/* Header */}
      <header className="container mx-auto px-4 py-6 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-10 h-10 bg-primary rounded-lg flex items-center justify-center">
            <Phone className="w-5 h-5 text-white" />
          </div>
          <span className="text-xl font-bold">RingPaw AI</span>
        </div>
        <Button onClick={() => void handleStartTrial()} disabled={isSigningIn}>
          Get Started
        </Button>
      </header>

      {/* Hero */}
      <section className="container mx-auto px-4 pt-20 pb-32 text-center">
        <div className="inline-flex items-center gap-2 bg-primary/10 text-primary px-4 py-2 rounded-full text-sm font-medium mb-6">
          <Zap className="w-4 h-4" />
          AI Receptionist for Pet Groomers
        </div>
        <h1 className="text-5xl md:text-6xl font-bold tracking-tight mb-6 max-w-3xl mx-auto">
          Never miss a booking while you&apos;re grooming
        </h1>
        <p className="text-xl text-muted-foreground mb-10 max-w-2xl mx-auto">
          RingPaw AI answers your missed calls, books appointments on your
          calendar, and texts you a summary — all in under 60 seconds.
        </p>
        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Button
            size="lg"
            className="text-lg px-8"
            onClick={() => void handleStartTrial()}
            disabled={isSigningIn}
          >
            {isSigningIn ? "Redirecting..." : "Start Free Trial"}
            <ArrowRight className="ml-2 w-5 h-5" />
          </Button>
          <Button size="lg" variant="outline" className="text-lg px-8">
            Watch Demo
          </Button>
        </div>
        {authError ? (
          <p className="mt-4 text-sm text-red-600">{authError}</p>
        ) : null}
      </section>

      {/* Features */}
      <section className="container mx-auto px-4 pb-32">
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <FeatureCard
            icon={<Phone className="w-6 h-6" />}
            title="AI Answers Your Calls"
            description="When you're busy with a client, RingPaw picks up and has a natural conversation with the caller."
          />
          <FeatureCard
            icon={<Calendar className="w-6 h-6" />}
            title="Books on Your Calendar"
            description="Checks your real-time availability and books confirmed appointments directly on Google Calendar, Calendly, or Cal.com."
          />
          <FeatureCard
            icon={<MessageSquare className="w-6 h-6" />}
            title="Texts You Everything"
            description="Get instant SMS summaries after every call. Manage your business by texting — block dates, add services, check your schedule."
          />
        </div>
      </section>

      {/* How it works */}
      <section className="bg-slate-50 py-24">
        <div className="container mx-auto px-4">
          <h2 className="text-3xl font-bold text-center mb-16">
            Set up in 15 minutes
          </h2>
          <div className="grid md:grid-cols-4 gap-8 max-w-4xl mx-auto">
            {[
              { step: "1", title: "Sign Up", desc: "Create your account with Google" },
              { step: "2", title: "Add Services", desc: "Enter your services and pricing" },
              { step: "3", title: "Connect Calendar", desc: "Link Google Calendar or Calendly" },
              { step: "4", title: "Forward Calls", desc: "Set up call forwarding on your phone" },
            ].map((item) => (
              <div key={item.step} className="text-center">
                <div className="w-12 h-12 bg-primary text-white rounded-full flex items-center justify-center text-xl font-bold mx-auto mb-4">
                  {item.step}
                </div>
                <h3 className="font-semibold mb-2">{item.title}</h3>
                <p className="text-sm text-muted-foreground">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing */}
      <section className="container mx-auto px-4 py-24">
        <h2 className="text-3xl font-bold text-center mb-4">
          Simple pricing
        </h2>
        <p className="text-center text-muted-foreground mb-16">
          Start with Starter. Upgrade as you grow.
        </p>
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
          <PricingCard
            name="Starter"
            price={149}
            isSigningIn={isSigningIn}
            onStartTrial={handleStartTrial}
            features={[
              "Up to 100 calls/month",
              "1 calendar connection",
              "Basic SMS commands",
              "Call transcripts",
            ]}
          />
          <PricingCard
            name="Pro"
            price={249}
            popular
            isSigningIn={isSigningIn}
            onStartTrial={handleStartTrial}
            features={[
              "Up to 300 calls/month",
              "3 calendar connections",
              "Full SMS command set",
              "Priority support",
            ]}
          />
          <PricingCard
            name="Business"
            price={399}
            isSigningIn={isSigningIn}
            onStartTrial={handleStartTrial}
            features={[
              "Unlimited calls",
              "5 calendar connections",
              "Full SMS + API access",
              "Multi-location support",
            ]}
          />
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-12">
        <div className="container mx-auto px-4 text-center text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} RingPaw AI. All rights reserved.
        </div>
      </footer>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="bg-white rounded-xl border p-8 shadow-sm">
      <div className="w-12 h-12 bg-primary/10 rounded-lg flex items-center justify-center text-primary mb-4">
        {icon}
      </div>
      <h3 className="text-lg font-semibold mb-2">{title}</h3>
      <p className="text-muted-foreground">{description}</p>
    </div>
  );
}

function PricingCard({
  name,
  price,
  features,
  popular,
  isSigningIn,
  onStartTrial,
}: {
  name: string;
  price: number;
  features: string[];
  popular?: boolean;
  isSigningIn: boolean;
  onStartTrial: () => Promise<void>;
}) {
  return (
    <div
      className={`rounded-xl border p-8 ${popular ? "border-primary shadow-lg ring-2 ring-primary/20 relative" : "bg-white shadow-sm"}`}
    >
      {popular && (
        <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary text-white text-xs font-medium px-3 py-1 rounded-full">
          Most Popular
        </div>
      )}
      <h3 className="text-lg font-semibold mb-2">{name}</h3>
      <div className="mb-6">
        <span className="text-4xl font-bold">${price}</span>
        <span className="text-muted-foreground">/mo</span>
      </div>
      <ul className="space-y-3 mb-8">
        {features.map((f) => (
          <li key={f} className="flex items-center gap-2 text-sm">
            <CheckCircle className="w-4 h-4 text-green-500 shrink-0" />
            {f}
          </li>
        ))}
      </ul>
      <Button
        className="w-full"
        variant={popular ? "default" : "outline"}
        onClick={() => void onStartTrial()}
        disabled={isSigningIn}
      >
        Get Started
      </Button>
    </div>
  );
}
