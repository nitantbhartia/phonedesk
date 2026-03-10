"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { BrandLogo } from "@/components/brand-logo";
import {
  OnboardingLayout,
  OnboardingLabel,
  OnboardingInput,
  OnboardingSelect,
  OnboardingFooter,
} from "@/components/onboarding/onboarding-layout";

interface ServiceEntry {
  name: string;
  price: string;
  duration: string;
}

type SavedBusinessHours = Record<string, { open: string; close: string }>;

const TIME_OPTIONS = [
  "6:00 AM", "7:00 AM", "8:00 AM", "9:00 AM", "10:00 AM", "11:00 AM",
  "12:00 PM", "1:00 PM", "2:00 PM", "3:00 PM", "4:00 PM", "5:00 PM",
  "6:00 PM", "7:00 PM", "8:00 PM", "9:00 PM",
];

const DEFAULT_HOURS = {
  "Mon - Fri": { open: "9:00 AM", close: "5:00 PM", enabled: true },
  Saturday: { open: "10:00 AM", close: "2:00 PM", enabled: true },
  Sunday: { open: "9:00 AM", close: "5:00 PM", enabled: false },
} as const;

function toTwentyFourHour(value: string) {
  if (!value.includes("AM") && !value.includes("PM")) {
    return value;
  }

  const [time, meridiem] = value.split(" ");
  const [rawHour, minute] = time.split(":");
  let hour = Number(rawHour);

  if (meridiem === "AM") {
    if (hour === 12) hour = 0;
  } else if (meridiem === "PM" && hour !== 12) {
    hour += 12;
  }

  return `${hour.toString().padStart(2, "0")}:${minute}`;
}

function toTwelveHour(value: string) {
  if (value.includes("AM") || value.includes("PM")) {
    return value;
  }

  const [rawHour, minute] = value.split(":");
  const hour = Number(rawHour);
  const meridiem = hour >= 12 ? "PM" : "AM";
  const twelveHour = hour % 12 || 12;
  return `${twelveHour}:${minute} ${meridiem}`;
}

function buildHoursState(savedHours?: SavedBusinessHours | null) {
  const weekdayHours =
    savedHours?.["mon-fri"] ||
    savedHours?.mon ||
    savedHours?.tue ||
    savedHours?.wed ||
    savedHours?.thu ||
    savedHours?.fri;
  const saturdayHours = savedHours?.sat || savedHours?.saturday;
  const sundayHours = savedHours?.sun || savedHours?.sunday;

  return {
    "Mon - Fri": weekdayHours
      ? {
          open: toTwelveHour(weekdayHours.open),
          close: toTwelveHour(weekdayHours.close),
          enabled: true,
        }
      : { ...DEFAULT_HOURS["Mon - Fri"] },
    Saturday: saturdayHours
      ? {
          open: toTwelveHour(saturdayHours.open),
          close: toTwelveHour(saturdayHours.close),
          enabled: true,
        }
      : { ...DEFAULT_HOURS.Saturday, enabled: false },
    Sunday: sundayHours
      ? {
          open: toTwelveHour(sundayHours.open),
          close: toTwelveHour(sundayHours.close),
          enabled: true,
        }
      : { ...DEFAULT_HOURS.Sunday },
  };
}

function formatPhoneNumber(value: string) {
  const digits = value.replace(/\D/g, "");

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 ${digits.slice(1, 4)}-${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return value;
}

const STEP_CONFIG = [
  {
    title: "Tell us about your shop",
    subtitle: "This helps your AI assistant speak naturally to your clients.",
    proTip: "Providing accurate pricing helps your AI assistant qualify leads and book higher-value appointments.",
  },
  {
    title: "Add your services & pricing",
    subtitle: "Your AI will share these details with callers and use them for booking.",
    proTip: "Adding duration estimates helps the AI schedule appointments without overlaps.",
  },
  {
    title: "Connect your booking system",
    subtitle: "Works with Google Calendar, Square Appointments, and Acuity Scheduling.",
    proTip: "Square is the most popular choice for groomers \u2014 RingPaw syncs bookings and avoids double-booking.",
  },
  {
    title: "Get your RingPaw number",
    subtitle: "We'll provision a local number so your AI receptionist can start taking calls.",
    proTip: "Your existing business number stays the same — callers still dial it as usual.",
  },
  {
    title: "Make a test call",
    subtitle: "Call your RingPaw number to hear your AI receptionist in action.",
    proTip: "Try asking about pricing, availability, or booking an appointment to see the full experience.",
  },
  {
    title: "Choose your plan",
    subtitle: "Pick the plan that fits your shop. You can upgrade or downgrade anytime.",
    proTip: "Most solo groomers start on Solo Groomer and upgrade when they get busier.",
  },
  {
    title: "You're all set!",
    subtitle: "Review your setup and go live when you're ready.",
    proTip: "You can always fine-tune your AI assistant's personality and responses in Settings.",
  },
  {
    title: "Set up call forwarding",
    subtitle: "Route unanswered calls from your business phone to your RingPaw number.",
    proTip: "Conditional forwarding means your AI only picks up when you don't — callers never know the difference.",
  },
];

const ONBOARDING_PLANS = [
  {
    id: "STARTER",
    name: "Solo",
    price: 99,
    features: ["120 minutes/month", "Everything included", "Calendar integration", "$0.40/min overage"],
    description: "For solo groomers tired of missing calls between clients.",
  },
  {
    id: "PRO",
    name: "Studio",
    price: 199,
    popular: true,
    features: ["300 minutes/month", "Priority setup", "Square + Google Calendar", "$0.40/min overage"],
    description: "For full-time groomers who want RingPaw handling every missed call.",
  },
  {
    id: "BUSINESS",
    name: "Salon",
    price: 349,
    features: ["500 minutes/month", "Priority support", "Multi-groomer routing", "$0.40/min overage"],
    description: "For small shops with multiple groomers and higher call volume.",
  },
];

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [direction, setDirection] = useState<"forward" | "backward">("forward");
  const [loading, setLoading] = useState(false);

  function navigate(newStep: number) {
    setDirection(newStep > step ? "forward" : "backward");
    setStep(newStep);
  }
  const [provisionError, setProvisionError] = useState("");

  // Step 1: Business info
  const [businessName, setBusinessName] = useState("");
  const [ownerName, setOwnerName] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [phone, setPhone] = useState("");
  const [address, setAddress] = useState("");
  const [timezone, setTimezone] = useState("America/Los_Angeles");

  // Business hours
  const [hours, setHours] = useState<
    Record<string, { open: string; close: string; enabled: boolean }>
  >(buildHoursState());

  // Step 2: Services
  const [services, setServices] = useState<ServiceEntry[]>([
    { name: "Full Groom", price: "75", duration: "90" },
    { name: "Bath & Brush", price: "45", duration: "60" },
    { name: "Nail Trim", price: "20", duration: "15" },
  ]);
  const [bookingMode, setBookingMode] = useState<"SOFT" | "HARD">("SOFT");
  const [groomers, setGroomers] = useState<Array<{ name: string; specialties: string }>>([]);

  // Step 3: Calendar
  const [calendarConnected, setCalendarConnected] = useState(false);

  // Step 4: Provisioned number
  const [provisionedNumber, setProvisionedNumber] = useState("");

  // Step 5: Test call status
  const [callPhase, setCallPhase] = useState<"waiting" | "in_progress" | "completed">("waiting");
  const [detectedCallSummary, setDetectedCallSummary] = useState<string | null>(null);
  const baselineCallCount = useRef<number | null>(null);
  const callPhaseRef = useRef(callPhase);

  // Step 6: Subscription
  const [subscribed, setSubscribed] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
  const [billingConsent, setBillingConsent] = useState(false);
  const formattedProvisionedNumber = provisionedNumber
    ? formatPhoneNumber(provisionedNumber)
    : "";

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/");
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let cancelled = false;

    const resumeOnboarding = async () => {
      const params =
        typeof window === "undefined"
          ? new URLSearchParams()
          : new URLSearchParams(window.location.search);
      const requestedStep = Number(params.get("step") || "0");
      const subscribedParam = params.get("subscribed") === "true";

      try {
        const response = await fetch("/api/business/profile");
        if (!response.ok) {
          throw new Error("Failed to load business profile");
        }

        const data = await response.json();
        const business = data.business;
        const hasCalendarConnection = Boolean(
          business?.calendarConnections?.some(
            (connection: { isActive?: boolean }) => connection.isActive
          )
        );

        if (!cancelled) {
          if (business?.onboardingComplete) {
            // Step 8 (call forwarding instructions) is purely informational and
            // can be reached from the dashboard "Set up now" banner even after
            // onboarding is complete — allow it through if a number is provisioned.
            if (requestedStep === 8 && business?.phoneNumber?.number) {
              setProvisionedNumber(business.phoneNumber.number);
              setStep(8);
              return;
            }
            // Step 7 (go-live / provision real number) can be re-entered from the
            // dashboard "Set up now" banner when a user completed onboarding but never
            // provisioned a real number (e.g. payment was skipped or failed).
            if (requestedStep === 7 && !business?.phoneNumber?.number) {
              setSubscribed(Boolean(business?.stripeSubscriptionId));
              setStep(7);
              return;
            }
            router.push("/dashboard");
            return;
          }

          setBusinessName(business?.name || "");
          setOwnerName(business?.ownerName || "");
          setCity(business?.city || "");
          setState(business?.state || "");
          setPhone(business?.phone || "");
          setAddress(business?.address || "");
          setTimezone(business?.timezone || "America/Los_Angeles");
          setBookingMode(business?.bookingMode || "SOFT");
          setHours(buildHoursState(business?.businessHours as SavedBusinessHours | undefined));
          if (business?.services?.length) {
            setServices(
              business.services.map(
                (service: { name: string; price: number; duration: number }) => ({
                  name: service.name,
                  price: service.price.toString(),
                  duration: service.duration.toString(),
                })
              )
            );
          }
          setCalendarConnected(hasCalendarConnection);
          setProvisionedNumber(business?.phoneNumber?.number || "");
          setSubscribed(subscribedParam || Boolean(business?.stripeSubscriptionId));

          // If resuming mid-onboarding (step param set, or profile already has data),
          // skip the welcome screen and go directly to the requested/first step.
          const hasExistingProfile = Boolean(business?.name);
          const normalizedStep =
            requestedStep >= 1
              ? Math.min(requestedStep, STEP_CONFIG.length)
              : hasExistingProfile ? 1 : 0;
          setStep(normalizedStep);
        }
      } catch {
        if (!cancelled) {
          setStep(requestedStep >= 1 ? requestedStep : 0);
        }
      }
    };

    void resumeOnboarding();

    return () => {
      cancelled = true;
    };
  }, [router, status]);

  // Keep ref in sync with callPhase so the polling closure always sees the latest value
  useEffect(() => { callPhaseRef.current = callPhase; }, [callPhase]);

  // Poll for test call on step 5 — detects calls via Retell webhooks writing to DB
  useEffect(() => {
    if (step !== 5) return;

    let pollInterval: ReturnType<typeof setInterval>;

    const isTerminal = (s?: string) =>
      s === "COMPLETED" || s === "NO_BOOKING" || s === "MISSED";

    const startPolling = async () => {
      try {
        const res = await fetch("/api/calls?limit=5");
        const data = await res.json() as { calls?: Array<{ status?: string; summary?: string | null }> };
        baselineCallCount.current = data.calls?.length ?? 0;
      } catch { /* ignore */ }

      pollInterval = setInterval(async () => {
        try {
          const res = await fetch("/api/calls?limit=5");
          const data = await res.json() as { calls?: Array<{ status?: string; summary?: string | null }> };
          const calls = data.calls ?? [];
          const phase = callPhaseRef.current;

          if (baselineCallCount.current !== null && calls.length > baselineCallCount.current) {
            const newest = calls[0];
            if (isTerminal(newest?.status)) {
              setDetectedCallSummary(newest?.summary ?? null);
              setCallPhase("completed");
            } else {
              // call_started fired — AI is live
              setCallPhase("in_progress");
            }
          } else if (phase === "in_progress") {
            // count hasn't changed, but status may have updated to terminal
            const newest = calls[0];
            if (isTerminal(newest?.status)) {
              setDetectedCallSummary(newest?.summary ?? null);
              setCallPhase("completed");
            }
          }
        } catch { /* ignore */ }
      }, 3000);
    };

    void startPolling();
    return () => clearInterval(pollInterval);
  }, [step]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-paw-sky flex items-center justify-center">
        <div className="animate-pulse text-paw-brown/50 font-medium">
          Loading...
        </div>
      </div>
    );
  }

  async function saveBusinessProfile() {
    setLoading(true);
    try {
      const businessHours: Record<string, { open: string; close: string }> = {};
      for (const [day, h] of Object.entries(hours)) {
        if (h.enabled) {
          if (day === "Mon - Fri") {
            for (const weekday of ["mon", "tue", "wed", "thu", "fri"]) {
              businessHours[weekday] = {
                open: toTwentyFourHour(h.open),
                close: toTwentyFourHour(h.close),
              };
            }
          } else {
            const shortKey = day === "Saturday" ? "sat" : day === "Sunday" ? "sun" : day.toLowerCase();
            businessHours[shortKey] = {
              open: toTwentyFourHour(h.open),
              close: toTwentyFourHour(h.close),
            };
          }
        }
      }

      const res = await fetch("/api/business/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: businessName,
          ownerName,
          city,
          state,
          phone,
          address,
          timezone,
          businessHours,
          bookingMode,
          services: services.filter((s) => s.name.trim()),
        }),
      });

      if (!res.ok) throw new Error("Failed to save profile");

      // Save groomers if any were added
      const validGroomers = groomers.filter((g) => g.name.trim());
      if (validGroomers.length > 0) {
        await fetch("/api/business/groomers", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            groomers: validGroomers.map((g) => ({
              name: g.name.trim(),
              specialties: g.specialties.split(",").map((s) => s.trim()).filter(Boolean),
            })),
          }),
        });
      }

      navigate(3);
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setLoading(false);
    }
  }

  function connectProvider(provider: string) {
    const params = new URLSearchParams({
      provider,
      redirect: "/onboarding?step=4",
    });
    window.location.href = `/api/calendar/connect?${params}`;
  }

  async function provisionNumber() {
    setLoading(true);
    setProvisionError("");
    try {
      const res = await fetch("/api/demo/start", { method: "POST" });
      const data = await res.json() as { demoNumber?: string; error?: string };

      if (!res.ok) {
        if (data.error === "demo_unavailable") {
          throw new Error("All demo lines are busy right now. Please try again in a moment.");
        }
        throw new Error(data.error || "Failed to get your test number");
      }

      setProvisionedNumber(data.demoNumber || "");
    } catch (error) {
      console.error("Error starting demo session:", error);
      setProvisionError(
        error instanceof Error ? error.message : "Failed to get your test number"
      );
    } finally {
      setLoading(false);
    }
  }

  async function startCheckout(planId: string) {
    setCheckoutLoading(planId);
    try {
      const res = await fetch("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          plan: planId,
          successUrl: "/onboarding?step=7&subscribed=true",
          cancelUrl: "/onboarding?step=6",
        }),
      });
      const data = await res.json() as { url?: string };
      if (data.url) window.location.href = data.url;
    } catch {
      // User stays on step 6
    } finally {
      setCheckoutLoading(null);
    }
  }

  async function goLive() {
    setLoading(true);
    try {
      // Provision the real dedicated number (payment-gated on the server)
      if (subscribed) {
        const phoneDigits = phone.replace(/\D/g, "");
        const areaCode = phoneDigits.length >= 10
          ? phoneDigits.slice(phoneDigits.length === 11 ? 1 : 0, 3)
          : undefined;
        const provRes = await fetch("/api/provision-number", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ areaCode }),
        });
        const provData = await provRes.json() as { phoneNumber?: string; alreadyProvisioned?: boolean; error?: string };
        if (provRes.ok && provData.phoneNumber) {
          setProvisionedNumber(provData.phoneNumber);
        } else if (!provData.alreadyProvisioned) {
          // Provisioning failed and this isn't a duplicate request — stop here.
          // Don't mark onboarding complete without a real number.
          console.error("[goLive] Number provisioning failed:", provData.error);
          throw new Error(provData.error || "Failed to provision your RingPaw number. Please try again.");
        }
        // End the demo session now that we have a real number
        await fetch("/api/demo/end", { method: "POST" }).catch(() => {
          // Non-fatal — demo session will expire on its own
        });
      }

      await fetch("/api/business/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Only activate live call answering when subscribed; always mark onboarding done
        body: JSON.stringify({ isActive: subscribed, onboardingComplete: true }),
      });
      if (subscribed) {
        navigate(8);
      } else {
        router.push("/dashboard");
      }
    } catch (error) {
      console.error("Error going live:", error);
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  function addService() {
    setServices([...services, { name: "", price: "", duration: "60" }]);
  }

  function removeService(index: number) {
    setServices(services.filter((_, i) => i !== index));
  }

  function updateService(
    index: number,
    field: keyof ServiceEntry,
    value: string
  ) {
    const updated = [...services];
    updated[index] = { ...updated[index], [field]: value };
    setServices(updated);
  }

  const config = STEP_CONFIG[step - 1];

  // Welcome screen — shown once before the form steps
  if (step === 0) {
    const firstName = session?.user?.name?.split(" ")[0] ?? "there";
    return (
      <div className="min-h-screen bg-paw-sky antialiased flex flex-col items-center justify-center py-12 px-6 relative">
        {/* Background decorations */}
        <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
          <svg className="leaf-shape absolute top-[-10%] left-[-5%] w-[500px] h-[500px] text-paw-amber" viewBox="0 0 200 200" fill="currentColor">
            <path d="M100 0C60 40 20 80 0 140C40 130 80 110 100 200C120 110 160 130 200 140C180 80 140 40 100 0Z" />
          </svg>
          <svg className="leaf-shape absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] text-white opacity-60" viewBox="0 0 200 200" fill="currentColor">
            <path d="M100 200C140 160 180 120 200 60C160 70 120 90 100 0C80 90 40 70 0 60C20 120 60 160 100 200Z" />
          </svg>
        </div>

        {/* Logo */}
        <div className="mb-6 relative z-10">
          <BrandLogo mobileWidth={140} desktopWidth={180} priority />
        </div>

        {/* Welcome card */}
        <main className="w-full max-w-lg bg-paw-cream rounded-[2.5rem] shadow-soft border-4 border-white relative z-10 p-10 sm:p-14 text-center">
          <div className="w-16 h-16 bg-paw-amber/20 rounded-full flex items-center justify-center mx-auto mb-6 text-3xl">
            👋
          </div>
          <h1 className="text-3xl font-extrabold text-paw-brown mb-3">
            Hey, {firstName}!
          </h1>
          <p className="text-paw-brown/60 font-medium mb-8 leading-relaxed">
            Let&apos;s get your AI receptionist set up. It only takes a few minutes — we&apos;ll walk you through it one step at a time.
          </p>

          {/* What they'll set up */}
          <ul className="text-left space-y-3 mb-10">
            {[
              { icon: "🏪", text: "Your business details & hours" },
              { icon: "✂️", text: "Services, pricing & groomers" },
              { icon: "📅", text: "Calendar sync" },
              { icon: "📞", text: "Call forwarding to your new number" },
              { icon: "💳", text: "Choose a plan (from $99/mo)" },
              { icon: "🚀", text: "A quick test call, then go live" },
            ].map((item) => (
              <li key={item.text} className="flex items-center gap-3 text-sm font-medium text-paw-brown/80">
                <span className="w-8 h-8 bg-white rounded-full flex items-center justify-center shrink-0 shadow-sm text-base">
                  {item.icon}
                </span>
                {item.text}
              </li>
            ))}
          </ul>

          <button
            onClick={() => navigate(1)}
            className="w-full px-8 py-4 bg-paw-brown text-paw-cream rounded-full font-bold text-lg hover:bg-opacity-90 transition-all shadow-soft flex items-center justify-center gap-2"
          >
            Let&apos;s get started
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
              <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
            </svg>
          </button>
        </main>
      </div>
    );
  }

  return (
    <OnboardingLayout
      currentStep={step}
      title={config.title}
      subtitle={config.subtitle}
      proTip={config.proTip}
      direction={direction}
    >
      {/* Step 1: Business Profile */}
      {step === 1 && (
        <form
          className="space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            navigate(2);
          }}
        >
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <OnboardingLabel
                htmlFor="businessName"
                info="The name spoken to callers when your AI answers (e.g. 'Happy Paws Grooming'). Use your full business name exactly as you'd say it on the phone."
              >
                Business Name
              </OnboardingLabel>
              <OnboardingInput
                id="businessName"
                placeholder="e.g. Happy Paws Grooming"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <OnboardingLabel
                htmlFor="ownerName"
                info="Your first name is used when the AI says 'Sarah is with a client right now, but I can help you.' Helps callers feel they're still reaching the right person."
              >
                Owner Name
              </OnboardingLabel>
              <OnboardingInput
                id="ownerName"
                placeholder="Your full name"
                value={ownerName}
                onChange={(e) => setOwnerName(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <OnboardingLabel
                htmlFor="phone"
                info="Your existing business phone number. We use the area code to assign you a local RingPaw number that matches your region, so callers see a familiar number."
              >
                Phone Number
              </OnboardingLabel>
              <OnboardingInput
                id="phone"
                placeholder="(619) 555-0100"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <OnboardingLabel
                htmlFor="address"
                info="Your full street address. The AI will share this when callers ask 'Where are you located?' or 'How do I get there?'"
              >
                Address
              </OnboardingLabel>
              <OnboardingInput
                id="address"
                placeholder="123 Main St, San Diego, CA"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="space-y-2">
              <OnboardingLabel
                htmlFor="city"
                info="Your city is included in the business profile so the AI can give accurate location context to callers asking about nearby drop-off or parking."
              >
                City
              </OnboardingLabel>
              <OnboardingInput
                id="city"
                placeholder="San Diego"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <OnboardingLabel
                htmlFor="state"
                info="Two-letter state abbreviation (e.g. CA, TX, FL). Used alongside your city for location context when callers ask where you're based."
              >
                State
              </OnboardingLabel>
              <OnboardingInput
                id="state"
                placeholder="CA"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <OnboardingLabel info="All appointment times, SMS reminders, and your daily report are displayed in this timezone. Pick the zone where your business is located.">
                Timezone
              </OnboardingLabel>
              <OnboardingSelect
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full px-5 py-4 rounded-2xl"
              >
                <option value="America/New_York">Eastern</option>
                <option value="America/Chicago">Central</option>
                <option value="America/Denver">Mountain</option>
                <option value="America/Los_Angeles">Pacific</option>
              </OnboardingSelect>
            </div>
          </div>

          {/* Business Hours */}
          <div className="space-y-4">
            <OnboardingLabel info="Set the days and times you accept appointments. The AI will only offer slots within these hours and tell callers you're closed outside of them. Toggle a day off to mark it closed.">
              Business Hours
            </OnboardingLabel>
            <div className="bg-white rounded-3xl p-6 border-2 border-paw-brown/5 space-y-4">
              {Object.entries(hours).map(([day, h]) => (
                <div
                  key={day}
                  className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 sm:gap-0 py-2 sm:py-1"
                >
                  <div className="flex items-center justify-between sm:justify-start">
                    <span
                      className={`font-bold w-24 ${
                        h.enabled ? "text-paw-brown" : "text-paw-brown/40"
                      }`}
                    >
                      {day}
                    </span>
                    <label className="relative inline-flex items-center cursor-pointer sm:hidden">
                      <input
                        type="checkbox"
                        checked={h.enabled}
                        onChange={(e) =>
                          setHours({
                            ...hours,
                            [day]: { ...h, enabled: e.target.checked },
                          })
                        }
                        className="sr-only peer"
                      />
                      <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-paw-orange" />
                    </label>
                  </div>
                  {h.enabled ? (
                    <div className="flex items-center gap-3">
                      <OnboardingSelect
                        value={h.open}
                        onChange={(e) =>
                          setHours({
                            ...hours,
                            [day]: { ...h, open: e.target.value },
                          })
                        }
                      >
                        {TIME_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </OnboardingSelect>
                      <span className="text-paw-brown/30 font-bold">to</span>
                      <OnboardingSelect
                        value={h.close}
                        onChange={(e) =>
                          setHours({
                            ...hours,
                            [day]: { ...h, close: e.target.value },
                          })
                        }
                      >
                        {TIME_OPTIONS.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </OnboardingSelect>
                    </div>
                  ) : (
                    <span className="text-sm font-bold text-paw-brown/40">
                      Closed
                    </span>
                  )}
                  <label className="relative inline-flex items-center cursor-pointer hidden sm:inline-flex">
                    <input
                      type="checkbox"
                      checked={h.enabled}
                      onChange={(e) =>
                        setHours({
                          ...hours,
                          [day]: { ...h, enabled: e.target.checked },
                        })
                      }
                      className="sr-only peer"
                    />
                    <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-paw-orange" />
                  </label>
                </div>
              ))}
            </div>
          </div>

          <OnboardingFooter
            showBack={true}
            backLabel="Cancel"
            onBack={() => router.push("/")}
            onNext={() => navigate(2)}
            nextDisabled={!businessName || !ownerName}
          />
        </form>
      )}

      {/* Step 2: Services & Pricing */}
      {step === 2 && (
        <div className="space-y-8">
          <div className="space-y-4">
            <OnboardingLabel info="List every service you offer with its price and how long it takes. The AI will quote these prices to callers, use the duration to find available slots, and avoid double-booking.">
              Services &amp; Pricing
            </OnboardingLabel>
            <div className="space-y-3">
              {services.map((service, i) => (
                <div
                  key={i}
                  className="flex flex-col sm:flex-row gap-3 sm:items-center bg-white p-3 rounded-2xl border-2 border-paw-brown/5 shadow-sm"
                >
                  <input
                    type="text"
                    placeholder="Service Name (e.g. Full Groom)"
                    value={service.name}
                    onChange={(e) => updateService(i, "name", e.target.value)}
                    className="flex-1 bg-transparent border-none p-2 font-medium text-paw-brown placeholder:text-paw-brown/30 focus:outline-none min-w-0"
                  />
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 sm:flex-none">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-paw-brown/50 font-bold">
                        $
                      </span>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={service.price}
                        onChange={(e) => updateService(i, "price", e.target.value)}
                        className="w-full sm:w-24 pl-7 pr-3 py-2 bg-paw-sky/30 border-none rounded-xl font-bold text-paw-brown focus:outline-none"
                      />
                    </div>
                    <div className="relative flex-1 sm:flex-none">
                      <input
                        type="number"
                        placeholder="min"
                        value={service.duration}
                        onChange={(e) =>
                          updateService(i, "duration", e.target.value)
                        }
                        className="w-full sm:w-20 px-3 py-2 bg-paw-sky/30 border-none rounded-xl font-bold text-paw-brown text-center focus:outline-none"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-paw-brown/40 text-xs font-bold">
                        min
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeService(i)}
                      disabled={services.length <= 1}
                      className="p-2 text-paw-brown/30 hover:text-paw-orange transition-colors disabled:opacity-30 shrink-0"
                    >
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.5"
                    >
                      <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                      </svg>
                    </button>
                  </div>
                </div>
              ))}
              <button
                type="button"
                onClick={addService}
                className="flex items-center gap-2 text-sm font-bold text-paw-orange hover:text-paw-brown transition-colors px-2"
              >
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="3"
                >
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add another service
              </button>
            </div>
          </div>

          {/* Optional settings — collapsed by default */}
          <details className="group">
            <summary className="list-none flex items-center gap-2 cursor-pointer text-sm font-bold text-paw-brown/50 hover:text-paw-brown/80 transition-colors select-none">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-open:rotate-90 transition-transform">
                <path d="m9 18 6-6-6-6" />
              </svg>
              Optional settings
            </summary>
            <div className="mt-4 space-y-4">
              <OnboardingLabel info="Soft booking holds the slot for 2 hours and sends the customer a confirmation link — you stay in control. Hard booking confirms immediately on your calendar. Most groomers start with Soft Book.">
                Default Booking Mode
              </OnboardingLabel>
              <div className="bg-white rounded-3xl p-6 border-2 border-paw-brown/5">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-paw-brown">
                      {bookingMode === "SOFT" ? "Soft Booking" : "Hard Booking"}
                    </p>
                    <p className="text-sm text-paw-brown/50 mt-1">
                      {bookingMode === "SOFT"
                        ? "Holds slot for 2 hours, sends confirmation link"
                        : "Confirms immediately on calendar"}
                    </p>
                  </div>
                  <OnboardingSelect
                    value={bookingMode}
                    onChange={(e) =>
                      setBookingMode(e.target.value as "SOFT" | "HARD")
                    }
                    className="px-4 py-3 rounded-2xl"
                  >
                    <option value="SOFT">Soft Book</option>
                    <option value="HARD">Hard Book</option>
                  </OnboardingSelect>
                </div>
              </div>
            </div>
          </details>

          {/* Groomers (optional) */}
          <div className="space-y-4">
            <OnboardingLabel info="If you have multiple groomers, add them here so callers can request someone by name. Include their specialties (e.g. doodles, cats, senior dogs) so the AI can match callers to the right groomer.">
              Your Groomers (Optional)
            </OnboardingLabel>
            <div className="space-y-3">
              {groomers.map((groomer, i) => (
                <div
                  key={i}
                  className="flex flex-col sm:flex-row gap-3 sm:items-center bg-white p-3 rounded-2xl border-2 border-paw-brown/5 shadow-sm"
                >
                  <input
                    type="text"
                    placeholder="Groomer name"
                    value={groomer.name}
                    onChange={(e) => {
                      const updated = [...groomers];
                      updated[i] = { ...groomer, name: e.target.value };
                      setGroomers(updated);
                    }}
                    className="flex-1 bg-transparent border-none p-2 font-medium text-paw-brown placeholder:text-paw-brown/30 focus:outline-none min-w-0"
                  />
                  <input
                    type="text"
                    placeholder="Specialties (e.g. doodles, cats)"
                    value={groomer.specialties}
                    onChange={(e) => {
                      const updated = [...groomers];
                      updated[i] = { ...groomer, specialties: e.target.value };
                      setGroomers(updated);
                    }}
                    className="flex-1 bg-transparent border-none p-2 font-medium text-paw-brown placeholder:text-paw-brown/30 focus:outline-none min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => setGroomers(groomers.filter((_, j) => j !== i))}
                    className="p-2 text-paw-brown/30 hover:text-paw-orange transition-colors shrink-0"
                  >
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M3 6h18m-2 0v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
                    </svg>
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={() => setGroomers([...groomers, { name: "", specialties: "" }])}
                className="flex items-center gap-2 text-sm font-bold text-paw-orange hover:text-paw-brown transition-colors px-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add a groomer
              </button>
            </div>
          </div>

          <OnboardingFooter
            onBack={() => navigate(1)}
            onNext={saveBusinessProfile}
            nextLabel="Continue Setup"
            loading={loading}
          />
        </div>
      )}

      {/* Step 3: Calendar Sync */}
      {step === 3 && (
        <div className="space-y-8">
          <div className="space-y-4">
            <OnboardingLabel info="Connect the calendar or booking tool you already use. RingPaw reads your live availability before offering any time slot and writes confirmed bookings directly — no double-booking, no manual entry.">
              Connect Your Booking System
            </OnboardingLabel>
            <p className="text-sm text-paw-brown/50 -mt-2">
              Pick whichever tool you already use. RingPaw reads availability and writes bookings directly.
            </p>
            <div className="space-y-3">
              {/* Google Calendar */}
              <button
                onClick={() => connectProvider("google")}
                className="w-full flex items-center gap-4 p-5 bg-white rounded-2xl border-2 border-paw-brown/5 hover:border-paw-orange/30 transition-all text-left group"
              >
                <div className="w-12 h-12 bg-red-50 rounded-2xl flex items-center justify-center shrink-0">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#DC2626"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                    <line x1="16" x2="16" y1="2" y2="6" />
                    <line x1="8" x2="8" y1="2" y2="6" />
                    <line x1="3" x2="21" y1="10" y2="10" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-bold text-paw-brown">
                    Google Calendar
                  </div>
                  <div className="text-sm text-paw-brown/50">
                    Read availability &amp; write bookings
                  </div>
                </div>
                {calendarConnected ? (
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#22C55E"
                      strokeWidth="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-paw-brown/30 group-hover:text-paw-orange transition-colors"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                )}
              </button>

              {/* Square Appointments */}
              <button
                onClick={() => connectProvider("square")}
                className="w-full flex items-center gap-4 p-5 bg-white rounded-2xl border-2 border-paw-brown/5 hover:border-paw-orange/30 transition-all text-left group"
              >
                <div className="w-12 h-12 bg-gray-900 rounded-2xl flex items-center justify-center shrink-0">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <rect x="2" y="2" width="20" height="20" rx="4" />
                    <path d="M7 10h4v4H7zM13 10h4v4h-4z" fill="#1a1a1a" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-bold text-paw-brown">
                    Square Appointments
                  </div>
                  <div className="text-sm text-paw-brown/50">
                    Sync bookings &amp; POS payments
                  </div>
                </div>
                {calendarConnected ? (
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#22C55E"
                      strokeWidth="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-paw-brown/30 group-hover:text-paw-orange transition-colors"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                )}
              </button>

              {/* Acuity Scheduling */}
              <button
                onClick={() => connectProvider("acuity")}
                className="w-full flex items-center gap-4 p-5 bg-white rounded-2xl border-2 border-paw-brown/5 hover:border-paw-orange/30 transition-all text-left group"
              >
                <div className="w-12 h-12 bg-[#316FA8] rounded-2xl flex items-center justify-center shrink-0">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="white"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <rect width="18" height="18" x="3" y="4" rx="2" ry="2" />
                    <line x1="16" x2="16" y1="2" y2="6" />
                    <line x1="8" x2="8" y1="2" y2="6" />
                    <line x1="3" x2="21" y1="10" y2="10" />
                    <path d="m9 16 2 2 4-4" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-bold text-paw-brown">
                    Acuity Scheduling
                  </div>
                  <div className="text-sm text-paw-brown/50">
                    Read availability &amp; write bookings
                  </div>
                </div>
                {calendarConnected ? (
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#22C55E"
                      strokeWidth="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  </div>
                ) : (
                  <svg
                    width="20"
                    height="20"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    className="text-paw-brown/30 group-hover:text-paw-orange transition-colors"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {!calendarConnected && (
            <p className="text-xs text-paw-brown/45 text-center mt-1">
              No calendar yet? That&apos;s okay — you can connect it later from Settings. RingPaw will still take calls; it just won&apos;t write bookings automatically until you do.
            </p>
          )}
          <OnboardingFooter
            onBack={() => navigate(2)}
            onNext={() => navigate(4)}
            nextLabel={calendarConnected ? "Continue Setup" : "Skip for Now"}
          />
        </div>
      )}

      {/* Step 4: Get Number */}
      {step === 4 && (
        <div className="space-y-6">
          {!provisionedNumber ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-paw-amber/20 rounded-full flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-paw-brown">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-paw-brown mb-2">
                Let&apos;s set up your test number
              </h3>
              <p className="text-paw-brown/50 font-medium mb-6 max-w-sm mx-auto text-sm">
                We&apos;ll give you a test line so you can hear your AI receptionist in action. Your dedicated number is assigned when you go live.
              </p>
              <button
                onClick={provisionNumber}
                disabled={loading}
                className="px-8 py-3 bg-paw-brown text-paw-cream rounded-full font-bold hover:bg-opacity-90 transition-all shadow-soft disabled:opacity-50"
              >
                {loading ? "Setting up..." : "Get My Test Number"}
              </button>
            </div>
          ) : (
            <div className="text-center py-4">
              <div className="inline-flex items-center gap-2 bg-green-50 border border-green-200 text-green-700 text-sm font-bold px-4 py-2 rounded-full mb-4">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><polyline points="20 6 9 17 4 12" /></svg>
                Test number ready!
              </div>
              <div className="bg-paw-amber/10 border-2 border-paw-amber/30 rounded-2xl p-5">
                <p className="text-xs font-bold text-paw-brown/50 uppercase tracking-wider mb-1">Your RingPaw Test Number</p>
                <p className="text-3xl font-extrabold text-paw-brown">{formattedProvisionedNumber}</p>
                <p className="text-sm text-paw-brown/50 mt-2">Next step: call this number to test your AI receptionist.</p>
              </div>
            </div>
          )}

          {provisionError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {provisionError}
            </div>
          ) : null}

          <OnboardingFooter
            onBack={() => navigate(3)}
            onNext={() => navigate(5)}
            nextDisabled={!provisionedNumber}
          />
        </div>
      )}

      {/* Step 5: Test Call */}
      {step === 5 && (
        <div className="space-y-5">
          {/* Phone icon — changes based on phase */}
          <div className="text-center py-2">
            <div className="relative inline-flex items-center justify-center w-28 h-28 mx-auto mb-5">
              {callPhase === "waiting" && (
                <>
                  <div className="absolute inset-0 rounded-full bg-paw-orange/20 animate-ping" style={{ animationDuration: "1.8s" }} />
                  <div className="absolute inset-3 rounded-full bg-paw-orange/15 animate-ping" style={{ animationDuration: "1.8s", animationDelay: "0.4s" }} />
                </>
              )}
              {callPhase === "in_progress" && (
                <>
                  <div className="absolute inset-0 rounded-full bg-amber-400/25 animate-ping" style={{ animationDuration: "1.2s" }} />
                  <div className="absolute inset-3 rounded-full bg-amber-400/20 animate-ping" style={{ animationDuration: "1.2s", animationDelay: "0.3s" }} />
                </>
              )}
              {callPhase === "completed" && (
                <div className="absolute inset-0 rounded-full bg-green-400/20" />
              )}
              <div className={`relative w-20 h-20 rounded-full flex items-center justify-center shadow-soft transition-colors duration-500 ${callPhase === "completed" ? "bg-green-500" : callPhase === "in_progress" ? "bg-amber-500" : "bg-paw-brown"}`}>
                {callPhase === "completed" ? (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                ) : (
                  <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                  </svg>
                )}
              </div>
            </div>

            {callPhase === "waiting" && (
              <>
                <p className="text-xs font-bold text-paw-brown/40 uppercase tracking-widest mb-2">Call this number now</p>
                <a
                  href={`tel:${provisionedNumber}`}
                  className="block text-4xl font-extrabold text-paw-brown tracking-wide hover:text-paw-orange transition-colors"
                >
                  {formattedProvisionedNumber || "—"}
                </a>
                <p className="text-xs text-paw-brown/40 mt-1">Tap to dial · or enter manually</p>
              </>
            )}

            {callPhase === "in_progress" && (
              <div className="animate-in fade-in duration-300">
                <p className="text-sm font-bold text-amber-600 mb-1">Your AI is on the call right now</p>
                <p className="text-xs text-paw-brown/40">Stay on the line — we&apos;ll detect when it&apos;s done.</p>
              </div>
            )}

            {callPhase === "completed" && (
              <div className="animate-in fade-in duration-300">
                <p className="text-sm font-bold text-green-700 mb-1">{detectedCallSummary ? "Call complete — your AI handled it!" : "Test call marked as done!"}</p>
                <p className="text-xs text-paw-brown/40">Your AI is ready for real calls.</p>
              </div>
            )}
          </div>

          {/* Sample script — only while waiting */}
          {callPhase === "waiting" && (
            <div className="bg-paw-sky/70 rounded-2xl p-4 border border-paw-brown/8">
              <p className="text-xs font-bold text-paw-brown/50 uppercase tracking-wider mb-2">Try saying this →</p>
              <p className="text-sm text-paw-brown/80 italic leading-relaxed">
                &ldquo;Hi, I&apos;m calling to book a grooming appointment for my golden retriever. He needs a full groom — do you have anything available next week?&rdquo;
              </p>
            </div>
          )}

          {/* In-progress banner */}
          {callPhase === "in_progress" && (
            <div className="animate-in fade-in duration-300 bg-amber-50 border-2 border-amber-200 rounded-2xl p-4 text-center">
              <div className="flex items-center justify-center gap-2">
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
                <span className="text-sm font-bold text-amber-700">Listening to your call live</span>
                <span className="w-2 h-2 rounded-full bg-amber-500 animate-pulse" />
              </div>
              <p className="text-xs text-amber-600/70 mt-1">We&apos;ll automatically move forward when the call ends.</p>
            </div>
          )}

          {/* AI call summary — after completion */}
          {callPhase === "completed" && detectedCallSummary && (
            <div className="animate-in fade-in slide-in-from-bottom-3 duration-400 bg-green-50 border-2 border-green-200 rounded-2xl p-4">
              <p className="text-xs font-bold text-green-700 uppercase tracking-wider mb-2">AI Call Summary</p>
              <p className="text-sm text-paw-brown/80 leading-relaxed">{detectedCallSummary}</p>
            </div>
          )}

          {/* Status indicator / manual fallback */}
          {callPhase === "waiting" && (
            <div className="space-y-3">
              <div className="flex items-center justify-center gap-3 py-1 text-paw-brown/40 text-xs font-bold">
                <span className="flex gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-paw-brown/30 animate-bounce" style={{ animationDelay: "0ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-paw-brown/30 animate-bounce" style={{ animationDelay: "120ms" }} />
                  <span className="w-1.5 h-1.5 rounded-full bg-paw-brown/30 animate-bounce" style={{ animationDelay: "240ms" }} />
                </span>
                Waiting for your call
              </div>
              <button
                onClick={() => setCallPhase("completed")}
                className="w-full py-3 rounded-full border-2 border-paw-brown/10 text-paw-brown/50 text-sm font-bold hover:border-paw-brown/25 hover:text-paw-brown/70 transition-all"
              >
                I&apos;ve already called ✓
              </button>
            </div>
          )}

          <OnboardingFooter
            onBack={() => navigate(4)}
            onNext={() => navigate(6)}
            nextLabel="Choose Plan"
            nextDisabled={callPhase === "waiting"}
          />
        </div>
      )}

      {/* Step 8: Call Forwarding */}
      {step === 8 && (
        <div className="space-y-5">
          {provisionedNumber && (
            <div className="bg-paw-amber/10 border-2 border-paw-amber/30 rounded-2xl p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-paw-brown/50 uppercase tracking-wider">Your RingPaw Number</p>
                <p className="text-xl font-extrabold text-paw-brown">{formattedProvisionedNumber}</p>
              </div>
              <button
                onClick={() => { void navigator.clipboard.writeText(formattedProvisionedNumber); }}
                className="text-xs font-bold text-paw-brown/60 hover:text-paw-brown px-3 py-1.5 rounded-lg bg-white border border-paw-brown/10 transition-colors"
              >
                Copy
              </button>
            </div>
          )}

          <p className="text-sm text-paw-brown/60 font-medium">
            Set up <strong className="text-paw-brown">conditional call forwarding</strong> on your business phone so calls that go unanswered automatically route to RingPaw. Your number stays the same — customers still call you as usual.
          </p>

          {/* iPhone instructions */}
          <div className="bg-white rounded-2xl border-2 border-paw-brown/5 overflow-hidden">
            <div className="px-4 py-3 bg-paw-cream/50 border-b border-paw-brown/5">
              <p className="text-xs font-bold text-paw-brown/60 uppercase tracking-wider">iPhone</p>
            </div>
            <div className="p-4 space-y-3">
              {[
                { n: 1, text: <>Open <strong>Settings</strong> → <strong>Phone</strong> → <strong>Call Forwarding</strong></> },
                { n: 2, text: <>Toggle <strong>Call Forwarding</strong> on</> },
                { n: 3, text: <><strong>Forward To:</strong> enter <strong>{formattedProvisionedNumber || "your RingPaw number"}</strong></> },
              ].map(({ n, text }) => (
                <div key={n} className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-paw-brown text-white rounded-full flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{n}</div>
                  <span className="text-sm text-paw-brown/80 font-medium">{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Android / carrier code */}
          <div className="bg-white rounded-2xl border-2 border-paw-brown/5 overflow-hidden">
            <div className="px-4 py-3 bg-paw-cream/50 border-b border-paw-brown/5">
              <p className="text-xs font-bold text-paw-brown/60 uppercase tracking-wider">Android or any carrier — dial code (works on all phones)</p>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-paw-brown/70 font-medium">
                Open your phone dialer and call this code. It activates forwarding for calls you don&apos;t answer (no-answer forwarding).
              </p>
              <div className="flex items-center gap-3 bg-paw-cream rounded-xl p-3">
                <code className="font-bold text-paw-brown text-base tracking-wider flex-1">
                  *61*{provisionedNumber ? provisionedNumber.replace(/\D/g, "") : "XXXXXXXXXX"}#
                </code>
                <button
                  onClick={() => { void navigator.clipboard.writeText(`*61*${provisionedNumber.replace(/\D/g, "")}#`); }}
                  className="text-xs font-bold text-paw-brown/60 hover:text-paw-brown px-3 py-1.5 rounded-lg bg-white border border-paw-brown/10 transition-colors shrink-0"
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-paw-brown/40 font-medium">
                For busy-line forwarding use <code className="bg-paw-cream px-1 rounded">*67*…#</code>, or forward all calls with <code className="bg-paw-cream px-1 rounded">*21*…#</code>.
              </p>
            </div>
          </div>

          <OnboardingFooter
            onBack={() => navigate(7)}
            onNext={() => router.push("/dashboard")}
            nextLabel="Go to Dashboard"
          />
        </div>
      )}

      {/* Step 6: Choose Plan */}
      {step === 6 && (
        <div className="space-y-6">
          {subscribed ? (
            <div className="flex items-center gap-3 bg-green-50 border-2 border-green-200 rounded-2xl px-6 py-4">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#16A34A" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              <p className="font-bold text-green-800">You&apos;re subscribed! Ready to go live.</p>
            </div>
          ) : (
            <div className="bg-paw-amber/10 border border-paw-amber/30 rounded-2xl px-5 py-4 text-sm text-paw-brown/80 leading-relaxed">
              <p className="font-bold text-paw-brown mb-1">30-day outcome guarantee</p>
              Your card is collected now but <strong>not charged</strong> until RingPaw books your first appointment. If RingPaw doesn&apos;t book a single appointment in 30 days, your subscription is automatically cancelled — no charge, no hard feelings.
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-3">
            {ONBOARDING_PLANS.map((plan) => (
              <div
                key={plan.id}
                className={`relative bg-white rounded-3xl p-6 border-2 flex flex-col ${plan.popular ? "border-paw-brown shadow-soft" : "border-paw-brown/10"}`}
              >
                {plan.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-4 py-1 bg-paw-brown text-paw-cream text-xs font-bold rounded-full whitespace-nowrap">
                    Most Popular
                  </div>
                )}
                <div className="mb-2">
                  <p className="font-extrabold text-paw-brown text-lg">{plan.name}</p>
                  <p className="text-3xl font-extrabold text-paw-brown mt-1">
                    ${plan.price}<span className="text-base font-medium text-paw-brown/50">/mo</span>
                  </p>
                </div>
                {plan.description && (
                  <p className="text-xs text-paw-brown/60 mb-3 leading-snug">{plan.description}</p>
                )}
                <ul className="space-y-2 mb-6 flex-1">
                  {plan.features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-sm text-paw-brown/70 font-medium">
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" className="text-paw-amber shrink-0 mt-0.5">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                      {f}
                    </li>
                  ))}
                </ul>
                <button
                  onClick={() => void startCheckout(plan.id)}
                  disabled={checkoutLoading !== null || subscribed || !billingConsent}
                  className={`w-full py-3 rounded-full font-bold text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed ${plan.popular ? "bg-paw-brown text-paw-cream hover:bg-opacity-90" : "border-2 border-paw-brown text-paw-brown hover:bg-paw-brown hover:text-paw-cream"}`}
                >
                  {checkoutLoading === plan.id ? "Redirecting..." : subscribed ? "Selected" : "Choose Plan"}
                </button>
              </div>
            ))}
          </div>

          {/* Billing consent checkbox — must be checked before any plan can be selected */}
          {!subscribed && (
            <label className="flex items-start gap-3 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={billingConsent}
                onChange={(e) => setBillingConsent(e.target.checked)}
                className="mt-0.5 w-4 h-4 accent-paw-brown shrink-0"
              />
              <span className="text-xs text-paw-brown/70 leading-relaxed">
                I understand that my card will be saved now but <strong>not charged</strong> until RingPaw successfully books my first appointment. If no appointment is booked within 30 days, my subscription will be cancelled automatically at no cost. Once RingPaw books my first appointment, my selected plan price will be charged immediately and will recur monthly until I cancel.
              </span>
            </label>
          )}

          <OnboardingFooter
            onBack={() => navigate(5)}
            onNext={() => navigate(7)}
            nextLabel={subscribed ? "Continue" : "Skip for Now"}
          />
        </div>
      )}

      {/* Step 7: Go Live */}
      {step === 7 && (
        <div className="space-y-8">
          <div className="bg-green-50 border-2 border-green-200 rounded-3xl p-8 text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#16A34A"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
                <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
                <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
                <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
              </svg>
            </div>
            <h3 className="text-xl font-bold text-green-900 mb-2">
              Ready to launch!
            </h3>
            <p className="text-green-700 font-medium">
              Your AI receptionist will answer calls, book appointments, and
              text you summaries.
            </p>
          </div>

          <div className="space-y-3">
            <OnboardingLabel info="A summary of everything you've configured. Once you click 'Go Live', your AI receptionist will start answering forwarded calls immediately. You can adjust any setting later from the dashboard.">
              Setup Summary
            </OnboardingLabel>
            {[
              {
                label: businessName || "Business Profile",
                desc: "Business profile configured",
              },
              {
                label: `${services.filter((s) => s.name).length} services`,
                desc: "Services and pricing set",
              },
              {
                label: calendarConnected
                  ? "Calendar connected"
                  : "Calendar skipped",
                desc: calendarConnected
                  ? "Calendar sync enabled"
                  : "You can connect later in Settings",
              },
              {
                label: formattedProvisionedNumber || "Phone number",
                desc: "RingPaw number provisioned",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-4 p-4 bg-white rounded-2xl border-2 border-paw-brown/5"
              >
                <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center shrink-0">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#22C55E"
                    strokeWidth="3"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <div className="font-bold text-paw-brown text-sm">
                    {item.label}
                  </div>
                  <div className="text-xs text-paw-brown/50">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {!subscribed && (
            <div className="flex items-center gap-3 bg-amber-50 border-2 border-amber-200 rounded-2xl px-6 py-4">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#D97706" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
                <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
              </svg>
              <p className="text-sm font-bold text-amber-800">
                Live call answering requires a subscription.{" "}
                <button onClick={() => navigate(6)} className="underline hover:no-underline">
                  Choose a plan
                </button>{" "}
                to activate it — or explore the dashboard first.
              </p>
            </div>
          )}

          <div className="pt-6 border-t border-paw-brown/5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate(6)}
              className="text-paw-brown/60 font-bold hover:text-paw-brown transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={goLive}
              disabled={loading}
              className="px-10 py-4 bg-green-600 text-white rounded-full font-bold text-lg hover:bg-green-700 transition-all shadow-soft flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? "Setting up..." : subscribed ? "Go Live!" : "Go to Dashboard"}
              <svg
                width="20"
                height="20"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
                <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
                <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
                <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
              </svg>
            </button>
          </div>
        </div>
      )}
    </OnboardingLayout>
  );
}
