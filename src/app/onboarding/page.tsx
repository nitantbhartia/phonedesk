"use client";

import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
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
    title: "Set up call forwarding",
    subtitle: "Forward missed calls from your business phone to your new RingPaw number.",
    proTip: "Use conditional forwarding to only route unanswered calls to your AI receptionist.",
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
];

const ONBOARDING_PLANS = [
  {
    id: "STARTER",
    name: "Solo Groomer",
    price: 49,
    features: ["50 minutes/month", "1 calendar connection", "Basic SMS commands", "Call transcripts"],
  },
  {
    id: "PRO",
    name: "Small Shop",
    price: 149,
    popular: true,
    features: ["200 minutes/month", "3 calendar connections", "Full SMS command set", "Custom voice & personality"],
  },
  {
    id: "BUSINESS",
    name: "Growing Pack",
    price: 299,
    features: ["500 minutes/month", "5 calendar connections", "Priority support", "Multi-location support"],
  },
];

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
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
  const [testCallDone, setTestCallDone] = useState(false);

  // Step 6: Subscription
  const [subscribed, setSubscribed] = useState(false);
  const [checkoutLoading, setCheckoutLoading] = useState<string | null>(null);
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
      const requestedStep = Number(params.get("step") || "1");
      const normalizedStep =
        Number.isFinite(requestedStep) && requestedStep >= 1
          ? Math.min(requestedStep, STEP_CONFIG.length)
          : 1;
      const subscribedParam = params.get("subscribed") === "true";
      // Always skip the welcome screen when resuming mid-onboarding

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
          setStep(normalizedStep);
        }
      } catch {
        if (!cancelled) {
          setStep(normalizedStep);
        }
      }
    };

    void resumeOnboarding();

    return () => {
      cancelled = true;
    };
  }, [router, status]);

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

      setStep(3);
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
      // Derive area code from the user's phone number
      const phoneDigits = phone.replace(/\D/g, "");
      if (phoneDigits.length < 10) {
        setProvisionError("Please go back and enter a valid 10-digit phone number so we can assign you a local area code.");
        setLoading(false);
        return;
      }
      const areaCode = phoneDigits.slice(phoneDigits.length === 11 ? 1 : 0, 3);
      const res = await fetch("/api/provision-number", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ areaCode }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to provision number");
      }

      setProvisionedNumber(data.phoneNumber);
    } catch (error) {
      console.error("Error provisioning number:", error);
      setProvisionError(
        error instanceof Error ? error.message : "Failed to provision number"
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
          successUrl: "/onboarding?step=6&subscribed=true",
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
      await fetch("/api/business/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        // Only activate live call answering when subscribed; always mark onboarding done
        body: JSON.stringify({ isActive: subscribed, onboardingComplete: true }),
      });
      router.push("/dashboard");
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
        <div className="mb-10 flex items-center gap-2 relative z-10">
          <div className="w-8 h-8 bg-paw-brown rounded-full flex items-center justify-center text-paw-amber">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 2v7.31" /><path d="M14 2v7.31" /><path d="M8.5 2h7" /><path d="M14 9.3a6.5 6.5 0 1 1-4 0" />
            </svg>
          </div>
          <span className="font-bold text-xl tracking-tight text-paw-brown">
            RingPaw<span className="text-paw-orange">.com</span>
          </span>
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
              { icon: "💳", text: "Choose a plan (from $49/mo)" },
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
            onClick={() => setStep(1)}
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
    >
      {/* Step 1: Business Profile */}
      {step === 1 && (
        <form
          className="space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            setStep(2);
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
            onNext={() => setStep(2)}
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
            onBack={() => setStep(1)}
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

          <OnboardingFooter
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
            nextLabel={calendarConnected ? "Continue Setup" : "Skip for Now"}
          />
        </div>
      )}

      {/* Step 4: Call Forwarding */}
      {step === 4 && (
        <div className="space-y-8">
          {!provisionedNumber ? (
            <div className="text-center py-8">
              <div className="w-20 h-20 bg-paw-amber/20 rounded-full flex items-center justify-center mx-auto mb-6">
                <svg
                  width="40"
                  height="40"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  className="text-paw-brown"
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-paw-brown mb-2">
                First, let&apos;s get you a RingPaw number
              </h3>
              <p className="text-paw-brown/50 font-medium mb-8 max-w-md mx-auto">
                We&apos;ll provision a local number in your area code so your AI
                receptionist can start taking calls.
              </p>
              <button
                onClick={provisionNumber}
                disabled={loading}
                className="px-10 py-4 bg-paw-brown text-paw-cream rounded-full font-bold text-lg hover:bg-opacity-90 transition-all shadow-soft disabled:opacity-50"
              >
                {loading ? "Provisioning..." : "Get My Number"}
              </button>
            </div>
          ) : (
            <>
              <div className="bg-paw-amber/10 border-2 border-paw-amber/30 rounded-3xl p-6 text-center">
                <div className="text-sm font-bold text-paw-brown/60 uppercase tracking-wider mb-2">
                  Your RingPaw Number
                </div>
                <div className="text-3xl font-extrabold text-paw-brown">
                  {formattedProvisionedNumber}
                </div>
              </div>

              <div className="space-y-4">
                <OnboardingLabel info="Set up conditional call forwarding so that when you don't answer (busy or ringing too long), your carrier automatically routes the call to your RingPaw number. Your existing number stays the same — callers dial it as usual.">
                  Set up call forwarding on your phone
                </OnboardingLabel>
                <div className="bg-white rounded-3xl p-6 border-2 border-paw-brown/5 space-y-4">
                  {[
                    {
                      num: 1,
                      text: (
                        <>
                          Open <strong>Settings</strong> &rarr;{" "}
                          <strong>Phone</strong> &rarr;{" "}
                          <strong>Call Forwarding</strong>
                        </>
                      ),
                    },
                    { num: 2, text: "Toggle on Call Forwarding" },
                    {
                      num: 3,
                      text: (
                        <>
                          Enter your RingPaw number:{" "}
                          <strong>{formattedProvisionedNumber}</strong>
                        </>
                      ),
                    },
                  ].map((item) => (
                    <div key={item.num} className="flex items-start gap-4">
                      <div className="w-8 h-8 bg-paw-brown text-white rounded-full flex items-center justify-center text-sm font-bold shrink-0">
                        {item.num}
                      </div>
                      <span className="text-paw-brown font-medium pt-1">
                        {item.text}
                      </span>
                    </div>
                  ))}
                </div>

                <div className="bg-paw-amber/10 border-2 border-paw-amber/20 rounded-2xl p-4">
                  <p className="text-sm text-paw-brown font-medium">
                    <strong>For conditional forwarding</strong> (forward only
                    when busy/unanswered), dial:
                  </p>
                  <code className="bg-paw-amber/20 text-paw-brown px-3 py-1 rounded-lg mt-2 inline-block font-bold text-sm">
                    *61*{provisionedNumber.replace(/\D/g, "")}#
                  </code>
                </div>
              </div>
            </>
          )}

          {provisionError ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
              {provisionError}
            </div>
          ) : null}

          <OnboardingFooter
            onBack={() => setStep(3)}
            onNext={() => setStep(5)}
            nextDisabled={!provisionedNumber}
          />
        </div>
      )}

      {/* Step 5: Test Call */}
      {step === 5 && (
        <div className="space-y-8">
          <div className="mx-auto max-w-4xl rounded-[2rem] border border-paw-brown/10 bg-white/75 px-5 py-8 shadow-soft sm:px-8 sm:py-10">
            <div className="mx-auto max-w-2xl text-center">
              <div className="mb-6 flex h-24 w-24 items-center justify-center rounded-full bg-paw-amber/20 mx-auto">
                <svg
                  width="46"
                  height="46"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="text-paw-brown"
                >
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>

              <h2 className="text-3xl font-extrabold tracking-tight text-paw-brown sm:text-4xl">
                Call {formattedProvisionedNumber || "your RingPaw number"}
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lg font-medium leading-8 text-paw-brown/55">
                Try booking an appointment as if you were a customer. The AI
                will greet you, look up your profile, and walk through the full
                booking flow.
              </p>
            </div>

            <div className="mx-auto mt-10 grid max-w-4xl gap-4 lg:grid-cols-[minmax(0,1fr)_360px] lg:items-center">
              <div className="rounded-[1.75rem] border border-paw-amber/30 bg-paw-amber/10 px-5 py-4 text-left sm:px-6">
                <div className="flex items-start gap-4">
                  <div className="mt-1 text-xl leading-none">💡</div>
                  <p className="text-base font-medium leading-8 text-paw-brown/75 sm:text-lg">
                    No calendar connected? No problem. The AI uses your
                    business hours to offer real slots. The call will appear in
                    your dashboard just like a live call would.
                  </p>
                </div>
              </div>

              {!testCallDone ? (
                <button
                  onClick={() => setTestCallDone(true)}
                  className="min-h-20 w-full rounded-full bg-paw-brown px-8 py-5 text-center text-xl font-bold text-paw-cream transition-all hover:bg-opacity-90 shadow-soft"
                >
                  I&apos;ve Made My Test Call
                </button>
              ) : (
                <div className="space-y-3">
                  <div className="flex min-h-20 w-full items-center justify-center gap-3 rounded-full border border-green-200 bg-green-50 px-6 py-5 text-center font-bold text-green-700">
                    <svg
                      width="20"
                      height="20"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                    Test call completed!
                  </div>
                  <p className="text-center text-sm font-medium text-paw-brown/50">
                    Check your dashboard to see the call log, transcript, and
                    AI summary.
                  </p>
                </div>
              )}
            </div>
          </div>

          <OnboardingFooter
            onBack={() => setStep(4)}
            onNext={() => setStep(6)}
            nextLabel={testCallDone ? "Continue Setup" : "Skip for Now"}
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
          ) : null}

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
                <div className="mb-4">
                  <p className="font-extrabold text-paw-brown text-lg">{plan.name}</p>
                  <p className="text-3xl font-extrabold text-paw-brown mt-1">
                    ${plan.price}<span className="text-base font-medium text-paw-brown/50">/mo</span>
                  </p>
                </div>
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
                  disabled={checkoutLoading !== null || subscribed}
                  className={`w-full py-3 rounded-full font-bold text-sm transition-colors disabled:opacity-50 ${plan.popular ? "bg-paw-brown text-paw-cream hover:bg-opacity-90" : "border-2 border-paw-brown text-paw-brown hover:bg-paw-brown hover:text-paw-cream"}`}
                >
                  {checkoutLoading === plan.id ? "Redirecting..." : subscribed ? "Selected" : "Choose Plan"}
                </button>
              </div>
            ))}
          </div>

          <OnboardingFooter
            onBack={() => setStep(5)}
            onNext={() => setStep(7)}
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
                <button onClick={() => setStep(6)} className="underline hover:no-underline">
                  Choose a plan
                </button>{" "}
                to activate it — or explore the dashboard first.
              </p>
            </div>
          )}

          <div className="pt-6 border-t border-paw-brown/5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(6)}
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
