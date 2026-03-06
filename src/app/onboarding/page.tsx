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
  const saturdayHours = savedHours?.sat;
  const sundayHours = savedHours?.sun;

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
    title: "Connect your calendar",
    subtitle: "RingPaw checks your calendar for availability and adds new bookings.",
    proTip: "Connecting your calendar lets the AI instantly confirm appointment times without back-and-forth.",
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
    title: "You're all set!",
    subtitle: "Review your setup and go live when you're ready.",
    proTip: "You can always fine-tune your AI assistant's personality and responses in Settings.",
  },
];

export default function OnboardingPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [step, setStep] = useState(1);
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

  // Step 3: Calendar
  const [calendarConnected, setCalendarConnected] = useState(false);

  // Step 4: Provisioned number
  const [provisionedNumber, setProvisionedNumber] = useState("");

  // Step 5: Test call status
  const [testCallDone, setTestCallDone] = useState(false);

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
          if (business) {
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
  }, [status]);

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
            businessHours[day.toLowerCase()] = {
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
      setStep(3);
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setLoading(false);
    }
  }

  async function connectGoogleCalendar() {
    const params = new URLSearchParams({
      provider: "google",
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
      const areaCode = phoneDigits.length >= 10
        ? phoneDigits.slice(phoneDigits.length === 11 ? 1 : 0, 3)
        : "415";
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

  async function goLive() {
    setLoading(true);
    try {
      await fetch("/api/business/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true, onboardingComplete: true }),
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
              <OnboardingLabel htmlFor="businessName">
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
              <OnboardingLabel htmlFor="ownerName">Owner Name</OnboardingLabel>
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
              <OnboardingLabel htmlFor="phone">Phone Number</OnboardingLabel>
              <OnboardingInput
                id="phone"
                placeholder="(619) 555-0100"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <OnboardingLabel htmlFor="address">Address</OnboardingLabel>
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
              <OnboardingLabel htmlFor="city">City</OnboardingLabel>
              <OnboardingInput
                id="city"
                placeholder="San Diego"
                value={city}
                onChange={(e) => setCity(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <OnboardingLabel htmlFor="state">State</OnboardingLabel>
              <OnboardingInput
                id="state"
                placeholder="CA"
                value={state}
                onChange={(e) => setState(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <OnboardingLabel>Timezone</OnboardingLabel>
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
            <OnboardingLabel>Business Hours</OnboardingLabel>
            <div className="bg-white rounded-3xl p-6 border-2 border-paw-brown/5 space-y-4">
              {Object.entries(hours).map(([day, h]) => (
                <div
                  key={day}
                  className="flex items-center justify-between py-1"
                >
                  <span
                    className={`font-bold w-24 ${
                      h.enabled ? "text-paw-brown" : "text-paw-brown/40"
                    }`}
                  >
                    {day}
                  </span>
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
                  <label className="relative inline-flex items-center cursor-pointer">
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
            <OnboardingLabel>Services &amp; Pricing</OnboardingLabel>
            <div className="space-y-3">
              {services.map((service, i) => (
                <div
                  key={i}
                  className="flex gap-3 items-center bg-white p-3 rounded-2xl border-2 border-paw-brown/5 shadow-sm"
                >
                  <input
                    type="text"
                    placeholder="Service Name (e.g. Full Groom)"
                    value={service.name}
                    onChange={(e) => updateService(i, "name", e.target.value)}
                    className="flex-1 bg-transparent border-none p-2 font-medium text-paw-brown placeholder:text-paw-brown/30 focus:outline-none"
                  />
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-paw-brown/50 font-bold">
                      $
                    </span>
                    <input
                      type="number"
                      placeholder="0.00"
                      value={service.price}
                      onChange={(e) => updateService(i, "price", e.target.value)}
                      className="w-24 pl-7 pr-3 py-2 bg-paw-sky/30 border-none rounded-xl font-bold text-paw-brown focus:outline-none"
                    />
                  </div>
                  <div className="relative">
                    <input
                      type="number"
                      placeholder="min"
                      value={service.duration}
                      onChange={(e) =>
                        updateService(i, "duration", e.target.value)
                      }
                      className="w-20 px-3 py-2 bg-paw-sky/30 border-none rounded-xl font-bold text-paw-brown text-center focus:outline-none"
                    />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-paw-brown/40 text-xs font-bold">
                      min
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => removeService(i)}
                    disabled={services.length <= 1}
                    className="p-2 text-paw-brown/30 hover:text-paw-orange transition-colors disabled:opacity-30"
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

          {/* Booking Mode */}
          <div className="space-y-4">
            <OnboardingLabel>Default Booking Mode</OnboardingLabel>
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
            <OnboardingLabel>Connect a Calendar</OnboardingLabel>
            <div className="space-y-3">
              <button
                onClick={connectGoogleCalendar}
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

              <button className="w-full flex items-center gap-4 p-5 bg-white rounded-2xl border-2 border-paw-brown/5 hover:border-paw-orange/30 transition-all text-left group">
                <div className="w-12 h-12 bg-blue-50 rounded-2xl flex items-center justify-center shrink-0">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#2563EB"
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
                  <div className="font-bold text-paw-brown">Calendly</div>
                  <div className="text-sm text-paw-brown/50">
                    Read availability &amp; create invitees
                  </div>
                </div>
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
              </button>

              <button className="w-full flex items-center gap-4 p-5 bg-white rounded-2xl border-2 border-paw-brown/5 hover:border-paw-orange/30 transition-all text-left group">
                <div className="w-12 h-12 bg-gray-50 rounded-2xl flex items-center justify-center shrink-0">
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#6B7280"
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
                  <div className="font-bold text-paw-brown">Cal.com</div>
                  <div className="text-sm text-paw-brown/50">
                    Read availability &amp; write bookings
                  </div>
                </div>
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
                  {provisionedNumber}
                </div>
              </div>

              <div className="space-y-4">
                <OnboardingLabel>
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
                          <strong>{provisionedNumber}</strong>
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
          <div className="text-center py-8">
            <div className="w-24 h-24 bg-paw-amber/20 rounded-full flex items-center justify-center mx-auto mb-6">
              <svg
                width="48"
                height="48"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                className="text-paw-brown"
              >
                <path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" x2="8" y1="13" y2="13" />
                <line x1="16" x2="8" y1="17" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>

            <h2 className="text-2xl font-extrabold text-paw-brown mb-3">
              Call {provisionedNumber || "your RingPaw number"}
            </h2>
            <p className="text-paw-brown/50 font-medium mb-8 max-w-md mx-auto">
              Try booking an appointment as if you were a customer. The AI will
              greet you with your business name and walk through the booking
              flow.
            </p>

            {!testCallDone ? (
              <button
                onClick={() => setTestCallDone(true)}
                className="px-10 py-4 bg-paw-brown text-paw-cream rounded-full font-bold text-lg hover:bg-opacity-90 transition-all shadow-soft"
              >
                I&apos;ve Made My Test Call
              </button>
            ) : (
              <div className="inline-flex items-center gap-3 bg-green-50 text-green-700 px-6 py-3 rounded-full font-bold">
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
            )}
          </div>

          <OnboardingFooter
            onBack={() => setStep(4)}
            onNext={() => setStep(6)}
            nextDisabled={!testCallDone}
          />
        </div>
      )}

      {/* Step 6: Go Live */}
      {step === 6 && (
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
            <OnboardingLabel>Setup Summary</OnboardingLabel>
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
                label: provisionedNumber || "Phone number",
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

          <div className="pt-6 border-t border-paw-brown/5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => setStep(5)}
              className="text-paw-brown/60 font-bold hover:text-paw-brown transition-colors"
            >
              Back
            </button>
            <button
              type="button"
              onClick={goLive}
              disabled={loading}
              className="px-10 py-4 bg-green-600 text-white rounded-full font-bold text-lg hover:bg-green-700 transition-all shadow-soft flex items-center gap-2 disabled:opacity-50"
            >
              {loading ? "Activating..." : "Go Live!"}
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
