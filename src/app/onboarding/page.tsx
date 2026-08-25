"use client";

import { useSession, signIn } from "next-auth/react";
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

interface WebsiteImportDraft {
  sourceUrl: string;
  businessName?: string;
  phone?: string;
  address?: string;
  city?: string;
  state?: string;
  timezone?: string;
  hours?: Record<string, { open: string; close: string; enabled: boolean }>;
  services: ServiceEntry[];
  importedFields: string[];
  inspectedPages: string[];
}

type SavedBusinessHours = Record<string, { open: string; close: string }>;

type OnboardingBusinessProfile = {
  onboardingComplete?: boolean;
  calendarConnections?: Array<{ isActive?: boolean }>;
  phoneNumber?: { number?: string | null } | null;
  stripeSubscriptionId?: string | null;
  name?: string | null;
  ownerName?: string | null;
  city?: string | null;
  state?: string | null;
  phone?: string | null;
  address?: string | null;
  timezone?: string | null;
  bookingMode?: string | null;
  businessHours?: SavedBusinessHours | null;
  services?: Array<{ name?: string | null; price?: number | null; duration?: number | null }>;
};

type OnboardingProfileResponse = {
  business?: OnboardingBusinessProfile | null;
  demoLeadHint?: { businessName?: string | null } | null;
};

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
    title: "What's your shop called?",
    subtitle: "Call Slot answers your forwarded calls with your shop name first — like voicemail that books.",
    proTip: "Use the name customers already know from your sign and Google listing.",
  },
  {
    title: "Connect Google Calendar",
    subtitle: "Call Slot reads your real openings and writes confirmed bookings. Google Calendar is required for v1.",
    proTip: "If you use Square or Acuity too, you can add them later in Settings.",
  },
  {
    title: "When are you open?",
    subtitle: "Call Slot only offers slots during these hours. After hours, callers still hear your shop name and can book the next openings.",
    proTip: "Match the hours on your door — callers hear these times when they press 2 for pricing.",
  },
  {
    title: "What can callers book by phone?",
    subtitle: "Add up to three services with duration and optional starting price. Call Slot keeps the menu short.",
    proTip: "Keep it to the 2–3 services callers actually book by phone. You can edit these anytime.",
  },
  {
    title: "Forward missed calls to Call Slot",
    subtitle: "Set up no-answer, busy, and after-hours forwarding on your existing shop line.",
    proTip: "Conditional forwarding only kicks in when you don't answer — customers still call your usual number.",
  },
  {
    title: "Walk through a test booking",
    subtitle: "Press through the keypad tree like a caller would. Success means you're ready for real forwarded calls.",
    proTip: "You can also curl /api/voice/simulate locally — see the dashboard empty state for an example.",
  },
];

const DISPLAY_STEP: Record<number, number> = {
  1: 1,
  4: 2,
  2: 4,
  8: 5,
  5: 6,
  3: 1,
  7: 6,
};

const websiteImportEnabled =
  process.env.NEXT_PUBLIC_ENABLE_WEBSITE_IMPORT === "true";

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
    { name: "Standard appointment", price: "75", duration: "60" },
    { name: "Express visit", price: "45", duration: "30" },
    { name: "Follow-up", price: "20", duration: "15" },
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
  // Prevents the resumeOnboarding effect from resetting step during inline auth (step 3).
  const skipNextResumeRef = useRef(false);

  // Auth step (step 3) state — shown inline for guests at step 2→3 transition
  const [profileError, setProfileError] = useState("");
  const [showWebsiteImport, setShowWebsiteImport] = useState(false);
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [websiteImportLoading, setWebsiteImportLoading] = useState(false);
  const [websiteImportError, setWebsiteImportError] = useState("");
  const [websiteImportSummary, setWebsiteImportSummary] = useState<{
    sourceUrl: string;
    importedFields: string[];
    serviceCount: number;
  } | null>(null);
  const [signupModalTab, setSignupModalTab] = useState<"signup" | "signin">("signup");
  const [signupName, setSignupName] = useState("");
  const [signupEmail, setSignupEmail] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupError, setSignupError] = useState("");
  const [awaitingApproval, setAwaitingApproval] = useState(false);
  const [signupLoading, setSignupLoading] = useState(false);
  const [simulateSessionId, setSimulateSessionId] = useState("");
  const [simulateLog, setSimulateLog] = useState<string[]>([]);
  const [simulateLoading, setSimulateLoading] = useState(false);
  async function runBookableSimulate(digit?: string) {
    setSimulateLoading(true);
    try {
      const body = simulateSessionId
        ? { sessionId: simulateSessionId, digit }
        : { businessId: undefined, from: phone || "+15555550100" };
      const res = await fetch("/api/voice/simulate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Simulate failed");
      if (data.sessionId) setSimulateSessionId(data.sessionId);
      setSimulateLog((prev) => [...prev, data.say || JSON.stringify(data)]);
      if (data.status === "BOOKED" || data.status === "REQUESTED" || data.status === "CALLBACK") {
        await fetch("/api/business/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ onboardingComplete: true, isActive: true }),
        });
      }
    } catch (error) {
      setSimulateLog((prev) => [
        ...prev,
        error instanceof Error ? error.message : "Simulate failed",
      ]);
    } finally {
      setSimulateLoading(false);
    }
  }

  const formattedProvisionedNumber = provisionedNumber
    ? formatPhoneNumber(provisionedNumber)
    : "";

  useEffect(() => {
    if (status !== "authenticated") {
      return;
    }

    let cancelled = false;

    const resumeOnboarding = async () => {
      if (skipNextResumeRef.current) {
        skipNextResumeRef.current = false;
        return;
      }
      const params =
        typeof window === "undefined"
          ? new URLSearchParams()
          : new URLSearchParams(window.location.search);
      const requestedStep = Number(params.get("step") || "0");
      const restoreDraft = params.get("restoreDraft") === "1";

      try {
        const response = await fetch("/api/business/profile");
        if (!response.ok) {
          throw new Error("Failed to load business profile");
        }

        const data = await response.json() as OnboardingProfileResponse;
        const demoLeadHint = data.demoLeadHint;
        const business = data.business;
        const hasCalendarConnection = Boolean(
          business?.calendarConnections?.some(
            (connection: { isActive?: boolean }) => connection.isActive
          )
        );

        if (!cancelled) {
          if (business?.onboardingComplete) {
            // Step 7 (call forwarding instructions) is purely informational and
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
              setStep(7);
              return;
            }
            router.push("/dashboard");
            return;
          }

          setBusinessName(business?.name || demoLeadHint?.businessName || "");
          setOwnerName(business?.ownerName || "");
          setCity(business?.city || "");
          setState(business?.state || "");
          setPhone(business?.phone || "");
          setAddress(business?.address || "");
          setTimezone(business?.timezone || "America/Los_Angeles");
          setBookingMode(business?.bookingMode === "HARD" ? "HARD" : "SOFT");
          setHours(buildHoursState(business?.businessHours as SavedBusinessHours | undefined));
          if (business?.services?.length) {
            setServices(
              business.services.map(
                (service) => ({
                  name: service.name || "",
                  price: String(service.price ?? ""),
                  duration: String(service.duration ?? ""),
                })
              )
            );
          }
          setCalendarConnected(hasCalendarConnection);
          setProvisionedNumber(business?.phoneNumber?.number || "");
          // Restore draft saved before Google OAuth redirect and auto-save
          if (restoreDraft && !business?.name) {
            try {
              const raw = localStorage.getItem("onboardingDraft");
              if (raw) {
                const draft = JSON.parse(raw) as {
                  businessName?: string; ownerName?: string; city?: string; state?: string;
                  phone?: string; address?: string; timezone?: string;
                  hours?: Record<string, { open: string; close: string; enabled: boolean }>;
                  services?: ServiceEntry[]; bookingMode?: "SOFT" | "HARD";
                  groomers?: Array<{ name: string; specialties: string }>;
                };
                localStorage.removeItem("onboardingDraft");
                // Directly POST the draft to the API — React state updates are async
                // and we can't rely on them being visible to doSaveProfile() yet.
                await fetch("/api/business/profile", {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({
                    name: draft.businessName || "",
                    ownerName: draft.ownerName || "",
                    city: draft.city || "",
                    state: draft.state || "",
                    phone: draft.phone || "",
                    address: draft.address || "",
                    timezone: draft.timezone || "America/Los_Angeles",
                    businessHours: draft.hours
                      ? Object.fromEntries(
                          Object.entries(draft.hours)
                            .filter(([, v]) => v.enabled)
                            .map(([day, v]) => [day, { open: v.open, close: v.close }])
                        )
                      : {},
                    bookingMode: draft.bookingMode || "SOFT",
                    services: (draft.services || []).map((s) => ({
                      name: s.name,
                      price: parseFloat(s.price) || 0,
                      duration: parseInt(s.duration) || 60,
                      isAddon: false,
                    })),
                  }),
                }).catch(() => { /* non-fatal */ });
                // Restore state for display
                if (draft.businessName) setBusinessName(draft.businessName);
                if (draft.ownerName) setOwnerName(draft.ownerName);
                if (draft.city) setCity(draft.city);
                if (draft.state) setState(draft.state);
                if (draft.phone) setPhone(draft.phone);
                if (draft.address) setAddress(draft.address);
                if (draft.timezone) setTimezone(draft.timezone);
                if (draft.hours) setHours(draft.hours);
                if (draft.services?.length) setServices(draft.services);
                if (draft.bookingMode) setBookingMode(draft.bookingMode);
                if (draft.groomers?.length) setGroomers(draft.groomers);
              }
            } catch { /* ignore */ }
          }

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

  // Skip the "Create Account" step (3) for already-authenticated users
  useEffect(() => {
    if (step === 3 && status === "authenticated") {
      navigate(4);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, status]);

  // Keep ref in sync with callPhase so the polling closure always sees the latest value
  useEffect(() => { callPhaseRef.current = callPhase; }, [callPhase]);

  // Poll for test call as soon as the number is provisioned — detects calls via Retell webhooks writing to DB
  useEffect(() => {
    if (!provisionedNumber) return;

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
              // call_started fired — the test line is live
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
  }, [provisionedNumber]);

  if (status === "loading") {
    return (
      <div className="min-h-screen bg-paper flex items-center justify-center">
        <div className="animate-pulse text-muted font-medium">
          Loading...
        </div>
      </div>
    );
  }

  // Validates step 1 fields and advances to step 2
  function validateStep1AndContinue() {
    setProfileError("");
    const phoneDigits = phone.replace(/\D/g, "");
    const trimmedName = businessName.trim().toLowerCase();
    const BLOCKED_NAMES = new Set(["test", "asdf", "aaa", "bbb", "abc", "123", "fake", "demo", "example", "qwerty", "xxx"]);

    if (trimmedName.length < 2 || BLOCKED_NAMES.has(trimmedName)) {
      setProfileError("Please enter your real business name.");
      return;
    }
    if (!ownerName.trim() || ownerName.trim().length < 2) {
      setProfileError("Please enter the owner's name.");
      return;
    }
    if (phoneDigits.length < 10) {
      setProfileError("Please enter a valid 10-digit US phone number.");
      return;
    }
    navigate(4);
  }

  async function importFromWebsite() {
    setWebsiteImportError("");
    setProfileError("");
    setWebsiteImportLoading(true);

    try {
      const response = await fetch("/api/onboarding/website-import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: websiteUrl }),
      });
      const payload = (await response.json()) as {
        draft?: WebsiteImportDraft;
        error?: string;
      };

      if (!response.ok || !payload.draft) {
        throw new Error(
          payload.error ||
            "We could not import that website right now. You can keep filling this out manually."
        );
      }

      const { draft } = payload;
      if (draft.businessName) setBusinessName(draft.businessName);
      if (draft.phone) setPhone(draft.phone);
      if (draft.address) setAddress(draft.address);
      if (draft.city) setCity(draft.city);
      if (draft.state) setState(draft.state);
      if (draft.timezone) setTimezone(draft.timezone);
      if (draft.hours) setHours(draft.hours);
      if (draft.services.length > 0) setServices(draft.services);

      setWebsiteImportSummary({
        sourceUrl: draft.sourceUrl,
        importedFields: draft.importedFields,
        serviceCount: draft.services.length,
      });
    } catch (error) {
      setWebsiteImportError(
        error instanceof Error
          ? error.message
          : "We could not import that website right now. You can keep filling this out manually."
      );
    } finally {
      setWebsiteImportLoading(false);
    }
  }

  // Core save logic — only called when authenticated
  async function doSaveProfile() {
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

      navigate(8);
    } catch (error) {
      console.error("Error saving profile:", error);
    } finally {
      setLoading(false);
    }
  }

  // Called from step 2 "Save Services" — gates on auth for guests
  async function saveBusinessProfile() {
    if (status !== "authenticated") {
      setSignupName(ownerName); // pre-fill name from business profile
      setSignupModalTab("signup");
      navigate(3);
      return;
    }
    await doSaveProfile();
  }

  // Persist form draft to localStorage before Google OAuth redirect
  function saveDraftToStorage() {
    try {
      localStorage.setItem("onboardingDraft", JSON.stringify({
        businessName, ownerName, city, state, phone, address, timezone,
        hours, services, bookingMode, groomers,
      }));
    } catch { /* ignore */ }
  }

  // Trigger Google OAuth — saves draft first so state survives the redirect
  function handleGoogleSignup() {
    saveDraftToStorage();
    signIn("google", { callbackUrl: "/onboarding?step=4&restoreDraft=1" });
  }

  // Signup + flush buffered data for guests
  async function handleSignupAndContinue(e: React.FormEvent) {
    e.preventDefault();
    setSignupError("");
    setSignupLoading(true);
    try {
      const regRes = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: signupName, email: signupEmail, password: signupPassword }),
      });
      const regData = await regRes.json() as { error?: string };
      if (!regRes.ok) {
        setSignupError(regData.error || "Failed to create account.");
        return;
      }

      skipNextResumeRef.current = true;
      const result = await signIn("credentials", {
        email: signupEmail,
        password: signupPassword,
        redirect: false,
      });
      if (result?.error) {
        skipNextResumeRef.current = false;
        setSignupError("Account created but sign-in failed. Please reload and try again.");
        return;
      }

      await doSaveProfile();
    } catch {
      setSignupError("Something went wrong. Please try again.");
    } finally {
      setSignupLoading(false);
    }
  }

  // Inline sign-in within the signup step
  async function handleSigninAndContinue(e: React.FormEvent) {
    e.preventDefault();
    setSignupError("");
    setSignupLoading(true);
    try {
      skipNextResumeRef.current = true;
      const result = await signIn("credentials", {
        email: signupEmail,
        password: signupPassword,
        redirect: false,
      });
      if (result?.error) {
        skipNextResumeRef.current = false;
        setSignupError("Invalid email or password.");
        return;
      }
      await doSaveProfile();
    } catch {
      setSignupError("Something went wrong. Please try again.");
    } finally {
      setSignupLoading(false);
    }
  }

  function connectProvider(provider: string) {
    const params = new URLSearchParams({
      provider,
      redirect: "/onboarding?step=5",
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
        if (data.error === "rate_limited") {
          throw new Error("Too many test requests from your network. Please try again tomorrow.");
        }
        if (data.error === "test_limit_reached") {
          throw new Error("You've reached the maximum number of test calls. Choose a plan to go live.");
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

  async function goLive() {
    setLoading(true);
    try {
      // Try to provision the real dedicated number (admin-approval-gated on the server)
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

      if (provRes.status === 403 && provData.error === "admin_approval_required") {
        // Admin hasn't approved yet — mark onboarding complete and show approval-pending message
        await fetch("/api/business/profile", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ onboardingComplete: true }),
        });
        setAwaitingApproval(true);
        setLoading(false);
        return;
      }

      if (provRes.ok && provData.phoneNumber) {
        setProvisionedNumber(provData.phoneNumber);
      } else if (!provData.alreadyProvisioned) {
        console.error("[goLive] Number provisioning failed:", provData.error);
        throw new Error(provData.error || "Failed to provision your Call Slot number. Please try again.");
      }

      // End the demo session now that we have a real number
      await fetch("/api/demo/end", { method: "POST" }).catch(() => {
        // Non-fatal — demo session will expire on its own
      });

      await fetch("/api/business/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isActive: true, onboardingComplete: true }),
      });
      navigate(8);
    } catch (error) {
      console.error("Error going live:", error);
      router.push("/dashboard");
    } finally {
      setLoading(false);
    }
  }

  function addService() {
    if (services.length >= 3) return;
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

  const config = STEP_CONFIG[(DISPLAY_STEP[step] || Math.min(step, 6)) - 1] || STEP_CONFIG[0];

  // Welcome screen — shown once before the form steps
  if (step === 0) {
    const firstName = session?.user?.name?.split(" ")[0];
    return (
      <div className="studio-onboarding min-h-screen bg-paper text-ink">
        <header className="border-b border-line">
          <div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-5 sm:px-10 lg:px-12">
            <BrandLogo priority />
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Set up your line</span>
          </div>
        </header>

        <main className="mx-auto grid max-w-[1180px] gap-10 px-6 py-12 sm:px-10 sm:py-20 lg:grid-cols-[250px_1fr] lg:gap-20 lg:px-12 lg:py-28">
          <aside className="lg:pt-3">
            <p className="studio-eyebrow mb-5"><span className="studio-eyebrow-line" />Before the line rings</p>
            <p className="font-display text-4xl leading-[0.95] tracking-[-0.055em] sm:text-5xl">A quieter phone starts here.</p>
            <p className="mt-6 text-sm leading-[1.6] text-muted">Five minutes to tell Call Slot what to say, where to look, and when to offer a time.</p>
          </aside>

          <section className="border border-line bg-surface p-6 sm:p-10">
          <h1 className="font-display text-4xl leading-[0.95] tracking-[-0.055em] sm:text-6xl">
            {firstName ? `${firstName}, let's put it on the line.` : "Let's put it on the line."}
          </h1>
          <p className="mt-5 max-w-md text-[16px] leading-[1.55] text-muted">You&apos;ll set up:</p>

          <div className="mt-6 border-y border-line">
            {[
              "your shop name",
              "your calendar",
              "your hours",
              "your short service menu",
              "a test call",
            ].map((item) => (
              <p key={item} className="border-b border-line py-3.5 text-[15px] last:border-b-0">
                {item}
              </p>
            ))}
          </div>

          <button
            onClick={() => navigate(1)}
            className="studio-button mt-10"
          >
            Continue <span aria-hidden="true">↗</span>
          </button>
          </section>
        </main>
      </div>
    );
  }

  return (
    <OnboardingLayout
      currentStep={DISPLAY_STEP[step] || Math.min(step, 6)}
      title={config.title}
      subtitle={config.subtitle}
      proTip={config.proTip}
      direction={direction}
    >
      {/* Step 3: Create Account (seamless onboarding step for guests) */}
      {step === 3 && (
        <div className="space-y-5">
          {/* Tab toggle */}
          <div className="flex border-b border-line">
            <button
              type="button"
              onClick={() => { setSignupModalTab("signup"); setSignupError(""); }}
              className={`flex-1 border-b-2 py-3 text-[12px] tracking-[0.04em] transition-all ${signupModalTab === "signup" ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              Create account
            </button>
            <button
              type="button"
              onClick={() => { setSignupModalTab("signin"); setSignupError(""); }}
              className={`flex-1 border-b-2 py-3 text-[12px] tracking-[0.04em] transition-all ${signupModalTab === "signin" ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink"}`}
            >
              Sign in
            </button>
          </div>

          {/* Google button */}
          <button
            type="button"
            onClick={handleGoogleSignup}
            className="w-full flex items-center justify-center gap-3 py-3.5 rounded-sm border border-line bg-surface font-semibold text-ink hover:bg-paper/40 transition-all"
          >
            <svg width="18" height="18" viewBox="0 0 48 48" fill="none">
              <path d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3 12.4 3 3 12.4 3 24s9.4 21 21 21c10.5 0 20-7.8 20-21 0-1.4-.2-2.7-.5-4z" fill="#FFC107"/>
              <path d="M6.3 14.7l7 5.1C15.1 16.5 19.2 14 24 14c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 5.1 29.6 3 24 3c-7.6 0-14.2 4.3-17.7 10.7z" fill="#FF3D00"/>
              <path d="M24 45c5.5 0 10.4-1.9 14.2-5.1l-6.6-5.5C29.6 36 26.9 37 24 37c-6.1 0-10.7-3.1-11.8-8.5l-7 5.4C8.2 40.8 15.5 45 24 45z" fill="#4CAF50"/>
              <path d="M44.5 20H24v8.5h11.8c-.8 2.4-2.3 4.4-4.3 5.9l6.6 5.5C41.5 37.1 45 31 45 24c0-1.4-.2-2.7-.5-4z" fill="#1976D2"/>
            </svg>
            Continue with Google
          </button>

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-ink/5" />
            <span className="text-xs text-muted font-semibold">or</span>
            <div className="flex-1 h-px bg-ink/5" />
          </div>

          {signupModalTab === "signup" ? (
            <form onSubmit={handleSignupAndContinue} className="space-y-3">
              <div className="space-y-1">
                <label className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted">Your name</label>
                <OnboardingInput
                  type="text"
                  required
                  autoComplete="name"
                  placeholder="Jane Smith"
                  value={signupName}
                  onChange={(e) => setSignupName(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted">Email</label>
                <OnboardingInput
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted">Password</label>
                <OnboardingInput
                  type="password"
                  required
                  autoComplete="new-password"
                  placeholder="12+ chars, upper, lower, number"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                />
              </div>
              {signupError && <p className="text-sm font-medium text-accent">{signupError}</p>}
              <div className="pt-4 border-t border-line flex items-center justify-between mt-2">
                <button type="button" onClick={() => navigate(2)} className="text-sm text-muted font-bold hover:text-ink transition-colors">Back</button>
                <button type="submit" disabled={signupLoading} className="px-7 py-3 bg-ink text-surface rounded-sm font-medium hover:bg-opacity-90 transition-all flex items-center gap-2 disabled:opacity-50">
                  {signupLoading ? "Creating account…" : "Create account & continue"}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </button>
              </div>
            </form>
          ) : (
            <form onSubmit={handleSigninAndContinue} className="space-y-3">
              <div className="space-y-1">
                <label className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted">Email</label>
                <OnboardingInput
                  type="email"
                  required
                  autoComplete="email"
                  placeholder="you@example.com"
                  value={signupEmail}
                  onChange={(e) => setSignupEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted">Password</label>
                <OnboardingInput
                  type="password"
                  required
                  autoComplete="current-password"
                  placeholder="Your password"
                  value={signupPassword}
                  onChange={(e) => setSignupPassword(e.target.value)}
                />
              </div>
              {signupError && <p className="text-sm font-medium text-accent">{signupError}</p>}
              <div className="pt-4 border-t border-line flex items-center justify-between mt-2">
                <button type="button" onClick={() => navigate(2)} className="text-sm text-muted font-bold hover:text-ink transition-colors">Back</button>
                <button type="submit" disabled={signupLoading} className="px-7 py-3 bg-ink text-surface rounded-sm font-medium hover:bg-opacity-90 transition-all flex items-center gap-2 disabled:opacity-50">
                  {signupLoading ? "Signing in…" : "Sign in & continue"}
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"/><path d="m12 5 7 7-7 7"/></svg>
                </button>
              </div>
            </form>
          )}
        </div>
      )}

      {/* Step 1: Business Profile */}
      {step === 1 && (
        <form
          className="space-y-8"
          onSubmit={(e) => {
            e.preventDefault();
            validateStep1AndContinue();
          }}
        >
          {websiteImportEnabled && (
            <div className="rounded-sm border border-line bg-surface px-5 py-5 ">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <p className="text-sm font-bold uppercase tracking-wider text-muted">
                    Import From Your Website
                  </p>
                  <h3 className="mt-1 text-lg font-medium text-ink">
                    Pull in your business info automatically
                  </h3>
                  <p className="mt-1 text-sm font-medium leading-relaxed text-muted">
                    We can scan your site for your business name, hours, phone, address,
                    and priced services, then drop that into this form for you to review.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setShowWebsiteImport((current) => !current)}
                  className="rounded-sm border border-line px-4 py-2 text-sm font-bold text-ink transition-colors hover:border-ink/25 hover:bg-paper/40"
                >
                  {showWebsiteImport ? "Hide importer" : "Use website importer"}
                </button>
              </div>

              {showWebsiteImport && (
                <div className="mt-5 space-y-4 border-t border-line pt-5">
                  <div className="space-y-2">
                    <OnboardingLabel
                      htmlFor="websiteUrl"
                      info="Paste your public website. We look for details on the homepage and a few common pages like Services, Contact, and FAQ."
                    >
                      Website URL
                    </OnboardingLabel>
                    <div className="flex flex-col gap-3 sm:flex-row">
                      <OnboardingInput
                        id="websiteUrl"
                        placeholder="https://yourshop.com"
                        value={websiteUrl}
                        onChange={(e) => setWebsiteUrl(e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => void importFromWebsite()}
                        disabled={websiteImportLoading || !websiteUrl.trim()}
                        className="rounded-sm bg-ink px-5 py-4 text-sm font-bold text-surface transition-all hover:bg-opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {websiteImportLoading ? "Importing..." : "Import"}
                      </button>
                    </div>
                  </div>

                  {websiteImportError ? (
                    <p className="rounded-sm border border-line bg-paper px-4 py-3 text-sm font-medium text-accent">
                      {websiteImportError}
                    </p>
                  ) : null}

                  {websiteImportSummary ? (
                    <div className="rounded-sm border border-line bg-paper px-4 py-3 text-sm text-ink">
                      <p className="font-bold">
                        Imported {websiteImportSummary.importedFields.length} field
                        {websiteImportSummary.importedFields.length === 1 ? "" : "s"} from{" "}
                        {websiteImportSummary.sourceUrl}
                      </p>
                      <p className="mt-1 font-medium">
                        Review everything below before continuing.
                        {websiteImportSummary.serviceCount > 0
                          ? ` We also found ${websiteImportSummary.serviceCount} priced service${websiteImportSummary.serviceCount === 1 ? "" : "s"}.`
                          : ""}
                      </p>
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <OnboardingLabel
                htmlFor="businessName"
                info="The name spoken to callers when Call Slot picks up (e.g. 'River Street Studio'). Use your full shop name exactly as you'd say it on the phone."
              >
                Business Name
              </OnboardingLabel>
              <OnboardingInput
                id="businessName"
                placeholder="Riverside Grooming"
                value={businessName}
                onChange={(e) => setBusinessName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <OnboardingLabel
                htmlFor="ownerName"
                info="Your first name is used when Call Slot says the shop is with a client right now. Helps callers feel they're still reaching the right person."
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
                info="Your existing business phone number. We use the area code to assign you a local Call Slot number that matches your region, so callers see a familiar number."
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
                info="Your full street address. Call Slot can share this when callers ask where you are."
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
                info="Your city is included in the business profile so callers get accurate location context."
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
                className="w-full px-5 py-4 rounded-sm"
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
            <OnboardingLabel info="Set the days and times you accept appointments. Call Slot will only offer slots within these hours. Toggle a day off to mark it closed.">
              Business Hours
            </OnboardingLabel>
            <div className="divide-y divide-line border-y border-line">
              {Object.entries(hours).map(([day, h]) => (
                <div
                  key={day}
                  className="flex flex-col gap-2 py-3.5 sm:flex-row sm:items-center sm:justify-between"
                >
                  <span className={`w-24 text-[14px] ${h.enabled ? "text-ink" : "text-muted"}`}>
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
                      <span className="text-[13px] text-muted">to</span>
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
                    <span className="text-[13px] text-muted">Closed</span>
                  )}
                  <button
                    type="button"
                    onClick={() =>
                      setHours({
                        ...hours,
                        [day]: { ...h, enabled: !h.enabled },
                      })
                    }
                    className="self-start text-[12px] tracking-[0.04em] text-muted hover:text-ink sm:self-auto"
                  >
                    {h.enabled ? "Open" : "Closed"}
                  </button>
                </div>
              ))}
            </div>
          </div>

          {profileError && (
            <p className="text-sm font-medium text-accent text-center -mb-2">{profileError}</p>
          )}
          <OnboardingFooter
            showBack={true}
            backLabel="Cancel"
            onBack={() => router.push("/")}
            onNext={validateStep1AndContinue}
            nextLabel="Continue"
            nextDisabled={!businessName || !ownerName}
          />
        </form>
      )}

      {/* Step 2: Services & Pricing */}
      {step === 2 && (
        <div className="space-y-8">
          <div className="space-y-4">
            <OnboardingLabel info="List the services callers can book by phone, with price and duration. Call Slot uses duration to find available slots and avoid double-booking.">
              Services &amp; Pricing
            </OnboardingLabel>
            <div className="space-y-3">
              {services.map((service, i) => (
                <div
                  key={i}
                  className="flex flex-col sm:flex-row gap-3 sm:items-center bg-surface p-3 rounded-sm border border-line "
                >
                  <input
                    type="text"
                    placeholder="Service Name (e.g. Full Groom)"
                    value={service.name}
                    onChange={(e) => updateService(i, "name", e.target.value)}
                    className="flex-1 bg-transparent border-none p-2 font-medium text-ink placeholder:text-muted focus:outline-none min-w-0"
                  />
                  <div className="flex items-center gap-3">
                    <div className="relative flex-1 sm:flex-none">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted font-bold">
                        $
                      </span>
                      <input
                        type="number"
                        placeholder="0.00"
                        value={service.price}
                        onChange={(e) => updateService(i, "price", e.target.value)}
                        className="w-full sm:w-24 pl-7 pr-3 py-2 bg-paper border-none rounded-sm font-bold text-ink focus:outline-none"
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
                        className="w-full sm:w-20 px-3 py-2 bg-paper border-none rounded-sm font-bold text-ink text-center focus:outline-none"
                      />
                      <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted text-xs font-bold">
                        min
                      </span>
                    </div>
                    <button
                      type="button"
                      onClick={() => removeService(i)}
                      disabled={services.length <= 1}
                      className="p-2 text-muted hover:text-accent transition-colors disabled:opacity-30 shrink-0"
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
                className="flex items-center gap-2 text-sm font-bold text-accent hover:text-ink transition-colors px-2"
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
            <summary className="list-none flex items-center gap-2 cursor-pointer text-sm font-bold text-muted hover:text-ink/80 transition-colors select-none">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="group-open:rotate-90 transition-transform">
                <path d="m9 18 6-6-6-6" />
              </svg>
              Optional settings
            </summary>
            <div className="mt-4 space-y-4">
              <OnboardingLabel info="Soft booking holds the slot for 2 hours — you stay in control. Hard booking confirms immediately on your calendar. Most shops start with Soft Book.">
                Default Booking Mode
              </OnboardingLabel>
              <div className="bg-surface rounded-sm p-6 border border-line">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="font-bold text-ink">
                      {bookingMode === "SOFT" ? "Soft Booking" : "Hard Booking"}
                    </p>
                    <p className="text-sm text-muted mt-1">
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
                    className="px-4 py-3 rounded-sm"
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
            <OnboardingLabel info="If you have more than one person taking appointments, add them here so you can keep names on file. Specialties are optional.">
              Your team (optional)
            </OnboardingLabel>
            <div className="space-y-3">
              {groomers.map((groomer, i) => (
                <div
                  key={i}
                  className="flex flex-col sm:flex-row gap-3 sm:items-center bg-surface p-3 rounded-sm border border-line "
                >
                  <input
                    type="text"
                    placeholder="Name"
                    value={groomer.name}
                    onChange={(e) => {
                      const updated = [...groomers];
                      updated[i] = { ...groomer, name: e.target.value };
                      setGroomers(updated);
                    }}
                    className="flex-1 bg-transparent border-none p-2 font-medium text-ink placeholder:text-muted focus:outline-none min-w-0"
                  />
                  <input
                    type="text"
                    placeholder="Role or notes (optional)"
                    value={groomer.specialties}
                    onChange={(e) => {
                      const updated = [...groomers];
                      updated[i] = { ...groomer, specialties: e.target.value };
                      setGroomers(updated);
                    }}
                    className="flex-1 bg-transparent border-none p-2 font-medium text-ink placeholder:text-muted focus:outline-none min-w-0"
                  />
                  <button
                    type="button"
                    onClick={() => setGroomers(groomers.filter((_, j) => j !== i))}
                    className="p-2 text-muted hover:text-accent transition-colors shrink-0"
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
                className="flex items-center gap-2 text-sm font-bold text-accent hover:text-ink transition-colors px-2"
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add a team member
              </button>
            </div>
          </div>

          <OnboardingFooter
            onBack={() => navigate(4)}
            onNext={saveBusinessProfile}
            nextLabel="Save Services"
            loading={loading}
          />
        </div>
      )}

      {/* Step 4: Calendar Sync */}
      {step === 4 && (
        <div className="space-y-8">
          <div className="space-y-4">
            <OnboardingLabel info="Connect the calendar or booking tool you already use. Call Slot reads your live availability before offering any time slot and writes confirmed bookings directly — no double-booking, no manual entry.">
              Connect Your Booking System
            </OnboardingLabel>
            <p className="text-sm text-muted -mt-2">
              Pick whichever tool you already use. Call Slot reads availability and writes bookings directly.
            </p>
            <div className="space-y-3">
              {/* Google Calendar */}
              <button
                onClick={() => connectProvider("google")}
                className="w-full flex items-center gap-4 p-5 bg-surface rounded-sm border border-line hover:border-accent/30 transition-all text-left group"
              >
                <div className="w-12 h-12 bg-paper rounded-sm flex items-center justify-center shrink-0">
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
                  <div className="font-bold text-ink">
                    Google Calendar
                  </div>
                  <div className="text-sm text-muted">
                    Read availability &amp; write bookings
                  </div>
                </div>
                {calendarConnected ? (
                  <div className="w-8 h-8 rounded-sm bg-paper flex items-center justify-center">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#6E2C2C"
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
                    className="text-muted group-hover:text-accent transition-colors"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                )}
              </button>

              {/* Square Appointments */}
              <button
                onClick={() => connectProvider("square")}
                className="w-full flex items-center gap-4 p-5 bg-surface rounded-sm border border-line hover:border-accent/30 transition-all text-left group"
              >
                <div className="w-12 h-12 bg-gray-900 rounded-sm flex items-center justify-center shrink-0">
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="white">
                    <rect x="2" y="2" width="20" height="20" rx="4" />
                    <path d="M7 10h4v4H7zM13 10h4v4h-4z" fill="#1a1a1a" />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="font-bold text-ink">
                    Square Appointments
                  </div>
                  <div className="text-sm text-muted">
                    Sync bookings &amp; POS payments
                  </div>
                </div>
                {calendarConnected ? (
                  <div className="w-8 h-8 rounded-sm bg-paper flex items-center justify-center">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#6E2C2C"
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
                    className="text-muted group-hover:text-accent transition-colors"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                )}
              </button>

              {/* Acuity Scheduling */}
              <button
                onClick={() => connectProvider("acuity")}
                className="w-full flex items-center gap-4 p-5 bg-surface rounded-sm border border-line hover:border-accent/30 transition-all text-left group"
              >
                <div className="w-12 h-12 bg-[#316FA8] rounded-sm flex items-center justify-center shrink-0">
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
                  <div className="font-bold text-ink">
                    Acuity Scheduling
                  </div>
                  <div className="text-sm text-muted">
                    Read availability &amp; write bookings
                  </div>
                </div>
                {calendarConnected ? (
                  <div className="w-8 h-8 rounded-sm bg-paper flex items-center justify-center">
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="#6E2C2C"
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
                    className="text-muted group-hover:text-accent transition-colors"
                  >
                    <path d="M5 12h14" />
                    <path d="m12 5 7 7-7 7" />
                  </svg>
                )}
              </button>
            </div>
          </div>

          {!calendarConnected && (
            <p className="text-xs text-muted text-center mt-1">
              No calendar yet? That&apos;s okay — you can connect it later from Settings. Call Slot will still take calls; it just won&apos;t write bookings automatically until you do.
            </p>
          )}
          <OnboardingFooter
            onBack={() => navigate(1)}
            onNext={() => navigate(2)}
            nextLabel={calendarConnected ? "Continue" : "Skip for now"}
          />
        </div>
      )}

      {/* Step 5: Get Number + Test Call (merged) */}
      {step === 5 && (
        <div className="space-y-5">
          <div className="bg-surface rounded-sm border border-line p-5 space-y-4">
            <p className="text-sm font-bold text-ink">Simulate a caller (no phone needed)</p>
            <p className="text-sm text-muted">
              Walk the keypad tree: press 1 to book, 9 for callback. This is the same flow forwarded callers hear.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => void runBookableSimulate()}
                disabled={simulateLoading}
                className="px-4 py-2 rounded-sm bg-ink text-surface text-sm font-bold disabled:opacity-50"
              >
                {simulateSessionId ? "Replay menu" : "Start a test call"}
              </button>
              {["1", "2", "9"].map((digit) => (
                <button
                  key={digit}
                  type="button"
                  onClick={() => void runBookableSimulate(digit)}
                  disabled={simulateLoading || !simulateSessionId}
                  className="px-4 py-2 rounded-sm border border-line text-sm font-bold disabled:opacity-40"
                >
                  Press {digit}
                </button>
              ))}
            </div>
            {simulateLog.length > 0 && (
              <div className="bg-paper/40 rounded-sm p-3 space-y-2 max-h-48 overflow-y-auto">
                {simulateLog.map((line, index) => (
                  <p key={`${index}-${line.slice(0, 12)}`} className="text-xs text-ink/80 font-medium">
                    {line}
                  </p>
                ))}
              </div>
            )}
            {simulateLog.some((line) => line.includes("booked") || line.includes("requested") || line.includes("call you back")) && (
              <div className="bg-paper border border-line rounded-sm p-4 text-center">
                <p className="font-bold text-ink">Success — Call Slot is working!</p>
                <p className="text-sm text-ink/80 mt-1">Forward a real missed call to hear it on a handset, or head to your dashboard.</p>
              </div>
            )}
          </div>

          {!provisionedNumber ? (
            <div className="text-center py-6">
              <div className="w-16 h-16 bg-line rounded-sm flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-ink">
                  <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" />
                </svg>
              </div>
              <h3 className="text-lg font-bold text-ink mb-2">
                Let&apos;s set up your test number
              </h3>
              <p className="text-muted font-medium mb-6 max-w-sm mx-auto text-sm">
                We&apos;ll give you a test line so you can walk the keypad tree. Your dedicated number is assigned when you go live.
              </p>
              <button
                onClick={provisionNumber}
                disabled={loading}
                className="px-8 py-3 bg-ink text-surface rounded-sm font-medium hover:bg-opacity-90 transition-all disabled:opacity-50"
              >
                {loading ? "Setting up..." : "Get My Test Number"}
              </button>
            </div>
          ) : (
            <>
              {/* Number display */}
              <div className="text-center py-2">
                <div className="relative inline-flex items-center justify-center w-20 h-20 mx-auto mb-5">
                  <div className="relative w-20 h-20 rounded-sm flex items-center justify-center bg-ink">
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
                    <p className="text-xs font-bold text-muted uppercase tracking-widest mb-2">Call this number now</p>
                    <a
                      href={`tel:${provisionedNumber}`}
                      className="block text-4xl font-medium text-ink tracking-wide hover:text-accent transition-colors"
                    >
                      {formattedProvisionedNumber}
                    </a>
                    <p className="text-xs text-muted mt-1">Tap to dial · or enter manually</p>
                  </>
                )}

                {callPhase === "in_progress" && (
                  <div className="animate-in fade-in duration-300">
                    <p className="text-sm font-bold text-ink mb-1">Call Slot is on the line</p>
                    <p className="text-xs text-muted">Stay on the line — we&apos;ll detect when it&apos;s done.</p>
                  </div>
                )}

                {callPhase === "completed" && (
                  <div className="animate-in fade-in duration-300">
                    <p className="text-xl font-medium text-ink mb-1">Call Slot booked it.</p>
                    <p className="text-sm text-muted">Ready to take real calls 24/7.</p>
                  </div>
                )}
              </div>

              {/* Sample script — only while waiting */}
              {callPhase === "waiting" && (
                <div className="bg-paper/70 rounded-sm p-4 border border-line">
                  <p className="text-xs font-bold text-muted uppercase tracking-wider mb-2">Try this →</p>
                  <p className="text-sm text-ink/80 italic leading-relaxed">
                    &ldquo;Press 1 to book, then pick a service and a time from the keypad.&rdquo;
                  </p>
                </div>
              )}

              {/* In-progress banner */}
              {callPhase === "in_progress" && (
                <div className="animate-in fade-in duration-300 bg-paper border border-line rounded-sm p-4 text-center">
                  <div className="flex items-center justify-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-ink animate-pulse" />
                    <span className="text-sm font-bold text-ink">Listening to your call live</span>
                    <span className="w-2 h-2 rounded-full bg-ink animate-pulse" />
                  </div>
                  <p className="text-xs text-ink/70 mt-1">We&apos;ll automatically move forward when the call ends.</p>
                </div>
              )}

              {/* Call summary — after completion */}
              {callPhase === "completed" && detectedCallSummary && (
                <div className="animate-in fade-in slide-in-from-bottom-3 duration-400 bg-paper border border-line rounded-sm p-4">
                  <p className="text-xs font-bold text-ink uppercase tracking-wider mb-2">Call summary</p>
                  <p className="text-sm text-ink/80 leading-relaxed">{detectedCallSummary}</p>
                </div>
              )}

              {/* Waiting indicator / manual fallback */}
              {callPhase === "waiting" && (
                <div className="space-y-3">
                  <div className="flex items-center justify-center gap-3 py-1 text-muted text-xs font-bold">
                    <span className="flex gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-ink/30 animate-bounce" style={{ animationDelay: "0ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-ink/30 animate-bounce" style={{ animationDelay: "120ms" }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-ink/30 animate-bounce" style={{ animationDelay: "240ms" }} />
                    </span>
                    Waiting for your call
                  </div>
                  <button
                    onClick={() => setCallPhase("completed")}
                    className="w-full py-3 rounded-sm border border-line text-muted text-sm font-bold hover:border-ink/25 hover:text-muted transition-all"
                  >
                    I&apos;ve already called ✓
                  </button>
                </div>
              )}
            </>
          )}

          {provisionError ? (
            <div className="rounded-sm border border-line bg-paper px-4 py-3 text-sm text-accent">
              {provisionError}
            </div>
          ) : null}

          <OnboardingFooter
            onBack={() => navigate(4)}
            onNext={() => navigate(7)}
            nextLabel={provisionedNumber ? "Continue" : "Continue"}
            nextDisabled={!provisionedNumber || callPhase === "waiting"}
          />
        </div>
      )}

      {/* Step 8: Call Forwarding */}
      {step === 8 && (
        <div className="space-y-5">
          {provisionedNumber && (
            <div className="bg-line border border-line rounded-sm p-4 flex items-center justify-between">
              <div>
                <p className="text-xs font-bold text-muted uppercase tracking-wider">Your Call Slot number</p>
                <p className="text-xl font-medium text-ink">{formattedProvisionedNumber}</p>
              </div>
              <button
                onClick={() => { void navigator.clipboard.writeText(formattedProvisionedNumber); }}
                className="border border-line bg-paper px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink"
              >
                Copy
              </button>
            </div>
          )}

          <p className="text-sm text-muted font-medium">
            Set up <strong className="text-ink">conditional call forwarding</strong> on your business phone so unanswered, busy, and after-hours calls route to Call Slot. Your shop number stays the same.
          </p>

          {/* iPhone instructions */}
          <div className="bg-surface rounded-sm border border-line overflow-hidden">
            <div className="px-4 py-3 bg-surface border-b border-line">
              <p className="text-xs font-bold text-muted uppercase tracking-wider">iPhone</p>
            </div>
            <div className="p-4 space-y-3">
              {[
                { n: 1, text: <>Open <strong>Settings</strong> → <strong>Phone</strong> → <strong>Call Forwarding</strong></> },
                { n: 2, text: <>Toggle <strong>Call Forwarding</strong> on</> },
                { n: 3, text: <><strong>Forward To:</strong> enter <strong>{formattedProvisionedNumber || "your Call Slot number"}</strong></> },
              ].map(({ n, text }) => (
                <div key={n} className="flex items-start gap-3">
                  <div className="w-6 h-6 bg-ink text-white rounded-sm flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">{n}</div>
                  <span className="text-sm text-ink/80 font-medium">{text}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Android / carrier code */}
          <div className="bg-surface rounded-sm border border-line overflow-hidden">
            <div className="px-4 py-3 bg-surface border-b border-line">
              <p className="text-xs font-bold text-muted uppercase tracking-wider">Android or any carrier — dial code (works on all phones)</p>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-sm text-muted font-medium">
                Open your phone dialer and call this code. It activates forwarding for calls you don&apos;t answer (no-answer forwarding).
              </p>
              <div className="flex items-center gap-3 bg-surface rounded-sm p-3">
                <code className="font-bold text-ink text-base tracking-wider flex-1">
                  *61*{provisionedNumber ? provisionedNumber.replace(/\D/g, "") : "XXXXXXXXXX"}#
                </code>
                <button
                  onClick={() => { void navigator.clipboard.writeText(`*61*${provisionedNumber.replace(/\D/g, "")}#`); }}
                  className="shrink-0 border border-line bg-paper px-3 py-1.5 text-xs text-muted transition-colors hover:text-ink"
                >
                  Copy
                </button>
              </div>
              <p className="text-xs text-muted font-medium">
                For busy-line forwarding use <code className="bg-surface px-1 rounded">*67*{provisionedNumber ? provisionedNumber.replace(/\D/g, "") : "NUMBER"}#</code>, or forward all calls with <code className="bg-surface px-1 rounded">*21*{provisionedNumber ? provisionedNumber.replace(/\D/g, "") : "NUMBER"}#</code>.
              </p>
            </div>
          </div>

          <div className="bg-surface rounded-sm border border-line overflow-hidden">
            <div className="px-4 py-3 bg-surface border-b border-line">
              <p className="text-xs font-bold text-muted uppercase tracking-wider">Common US carriers</p>
            </div>
            <div className="p-4 space-y-3 text-sm text-muted font-medium">
              <p><strong>Verizon / AT&amp;T / T-Mobile:</strong> dial the codes above from your shop handset, or use Settings → Phone → Call Forwarding on iPhone.</p>
              <p><strong>No-answer:</strong> <code className="bg-surface px-1 rounded">*61*NUMBER#</code> · <strong>Busy:</strong> <code className="bg-surface px-1 rounded">*67*NUMBER#</code> · <strong>All calls:</strong> <code className="bg-surface px-1 rounded">*21*NUMBER#</code></p>
              <p className="text-xs text-muted">Replace NUMBER with your Call Slot line digits only (no +1). To turn off: <code className="bg-surface px-1 rounded">##61#</code> no-answer, <code className="bg-surface px-1 rounded">##67#</code> busy, <code className="bg-surface px-1 rounded">##21#</code> all.</p>
            </div>
          </div>

          <OnboardingFooter
            onBack={() => navigate(2)}
            onNext={() => navigate(5)}
            nextLabel="Test Call Slot"
          />
        </div>
      )}

      {/* Step 6: Choose Plan */}
      {/* Step 7: Go Live (step 6 skipped — no billing) */}
      {step === 7 && (
        <div className="space-y-8">
          <div className="bg-paper border border-line rounded-sm p-8 text-center">
            <div className="w-16 h-16 bg-paper rounded-sm flex items-center justify-center mx-auto mb-4">
              <svg
                width="32"
                height="32"
                viewBox="0 0 24 24"
                fill="none"
                stroke="#6E2C2C"
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
            <h3 className="text-xl font-bold text-ink mb-2">
              Ready to launch!
            </h3>
            <p className="text-ink font-medium">
              Call Slot will pick up forwarded calls, offer real calendar openings by keypad, and
              text you confirmations.
            </p>
          </div>

          <div className="space-y-3">
            <OnboardingLabel info="A summary of everything you've configured. Once you click 'Go Live', Call Slot will start answering forwarded calls immediately. You can adjust any setting later from the dashboard.">
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
                desc: "Call Slot number provisioned",
              },
            ].map((item) => (
              <div
                key={item.label}
                className="flex items-center gap-4 p-4 bg-surface rounded-sm border border-line"
              >
                <div className="w-8 h-8 rounded-sm bg-paper flex items-center justify-center shrink-0">
                  <svg
                    width="16"
                    height="16"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="#6E2C2C"
                    strokeWidth="3"
                  >
                    <polyline points="20 6 9 17 4 12" />
                  </svg>
                </div>
                <div>
                  <div className="font-bold text-ink text-sm">
                    {item.label}
                  </div>
                  <div className="text-xs text-muted">{item.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {awaitingApproval && (
            <div className="bg-paper border border-line rounded-sm p-8 text-center">
              <div className="w-16 h-16 bg-paper rounded-sm flex items-center justify-center mx-auto mb-4">
                <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#1C1916" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <polyline points="12 6 12 12 16 14" />
                </svg>
              </div>
              <h3 className="text-xl font-bold text-blue-900 mb-2">
                Your setup is complete!
              </h3>
              <p className="text-ink font-medium leading-relaxed">
                We&apos;re reviewing your account and will activate your line shortly.
                {phone && <> We&apos;ll text you at <strong>{formatPhoneNumber(phone)}</strong> when you&apos;re live.</>}
              </p>
              <button
                type="button"
                onClick={() => router.push("/dashboard")}
                className="mt-6 px-8 py-3 bg-ink text-surface rounded-sm font-medium hover:bg-opacity-90 transition-all "
              >
                Go to Dashboard
              </button>
            </div>
          )}

          {!awaitingApproval && (
            <div className="pt-6 border-t border-line flex items-center justify-between">
              <button
                type="button"
                onClick={() => navigate(5)}
                className="text-muted font-bold hover:text-ink transition-colors"
              >
                Back
              </button>
              <button
                type="button"
                onClick={goLive}
                disabled={loading}
                className="px-10 py-4 bg-accent text-accent-foreground rounded-sm font-medium text-lg hover:bg-accent-hover transition-all flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {loading ? "Setting up…" : "Go live"}
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
          )}
        </div>
      )}
    </OnboardingLayout>
  );
}
