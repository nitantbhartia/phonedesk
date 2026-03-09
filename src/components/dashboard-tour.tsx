"use client";

import { useEffect, useState } from "react";

const TOUR_KEY = "ringpaw_tour_v1";

interface TourSlide {
  icon: React.ReactNode;
  title: string;
  body: string;
  hint?: string;
}

const PhoneIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 6.75c0 8.284 6.716 15 15 15h2.25a2.25 2.25 0 002.25-2.25v-1.372c0-.516-.351-.966-.852-1.091l-4.423-1.106c-.44-.11-.902.055-1.173.417l-.97 1.293c-.282.376-.769.542-1.21.38a12.035 12.035 0 01-7.143-7.143c-.162-.441.004-.928.38-1.21l1.293-.97c.363-.271.527-.734.417-1.173L6.963 3.102a1.125 1.125 0 00-1.091-.852H4.5A2.25 2.25 0 002.25 4.5v2.25z" />
  </svg>
);

const ChartIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18L9 11.25l4.306 4.307a11.95 11.95 0 015.814-5.519l2.74-1.22m0 0l-5.94-2.28m5.94 2.28l-2.28 5.941" />
  </svg>
);

const CalendarIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 3v2.25M17.25 3v2.25M3 18.75V7.5a2.25 2.25 0 012.25-2.25h13.5A2.25 2.25 0 0121 7.5v11.25m-18 0A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75m-18 0v-7.5A2.25 2.25 0 015.25 9h13.5A2.25 2.25 0 0121 11.25v7.5" />
  </svg>
);

const BotIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
    <rect x="3" y="11" width="18" height="11" rx="2" strokeLinecap="round" strokeLinejoin="round" />
    <path strokeLinecap="round" strokeLinejoin="round" d="M12 11V7m0-4a1 1 0 110 2 1 1 0 010-2zm-4 8h.01M16 15h.01M9 19h6" />
  </svg>
);

const ShieldIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
  </svg>
);

const CheckIcon = () => (
  <svg className="w-8 h-8" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth={1.8}>
    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
  </svg>
);

const SLIDES: TourSlide[] = [
  {
    icon: <PhoneIcon />,
    title: "Welcome to your dashboard",
    body: "Your AI receptionist is live. This is home base — every call, every booking, and every dollar saved shows up here. Let's take 30 seconds to walk through the key pieces.",
    hint: "Use the arrows to move through the tour, or press Skip to jump straight in.",
  },
  {
    icon: <ChartIcon />,
    title: "Revenue Protected",
    body: "This number is the estimated revenue your AI saved by answering calls you couldn't get to. It's calculated from the bookings your AI confirmed multiplied by your average service price.",
    hint: "Tip: Keep your services and prices up to date in AI Settings so this reflects reality.",
  },
  {
    icon: <PhoneIcon />,
    title: "Your Call Log",
    body: "Every call your AI handles is logged here — who called, what was booked, and how long it lasted. Tap any row to read the full transcript and see exactly what was said.",
    hint: "Calls tagged \"Follow-up Needed\" are ones the AI answered but didn't book — worth a quick callback.",
  },
  {
    icon: <CalendarIcon />,
    title: "Today's Schedule",
    body: "The Today page shows your appointments for the day in order. Tap the status button on each appointment as pets check in, start grooming, and get picked up. Customers are auto-notified by SMS at each step.",
  },
  {
    icon: <BotIcon />,
    title: "Customize your AI",
    body: "Under AI Settings you can change your receptionist's voice, personality, and booking behavior. Your services and prices are synced to the AI so it always quotes the right amounts and books the right duration.",
    hint: "Mark a service as \"Add-on\" to let your AI upsell it to returning customers during the call.",
  },
  {
    icon: <CheckIcon />,
    title: "You're all set!",
    body: "Make a test call to your RingPaw number to hear your AI in action. You can replay this tour any time from the dashboard header.",
    hint: "Questions? Reach us through the help link at the bottom of any page.",
  },
];

interface Props {
  open: boolean;
  onClose: () => void;
}

export function DashboardTour({ open, onClose }: Props) {
  const [step, setStep] = useState(0);

  // Reset to slide 0 whenever the tour opens
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  if (!open) return null;

  const slide = SLIDES[step];
  const isLast = step === SLIDES.length - 1;

  function handleClose() {
    localStorage.setItem(TOUR_KEY, "done");
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ backgroundColor: "rgba(0,0,0,0.5)", backdropFilter: "blur(4px)" }}
    >
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden">
        {/* Progress bar */}
        <div className="h-1 bg-paw-cream">
          <div
            className="h-full bg-paw-orange transition-all duration-300"
            style={{ width: `${((step + 1) / SLIDES.length) * 100}%` }}
          />
        </div>

        <div className="p-8">
          {/* Icon */}
          <div className="w-14 h-14 rounded-2xl bg-paw-orange/10 text-paw-orange flex items-center justify-center mb-5">
            {slide.icon}
          </div>

          {/* Step counter */}
          <p className="text-xs font-bold uppercase tracking-widest text-paw-brown/40 mb-2">
            {step + 1} of {SLIDES.length}
          </p>

          {/* Title */}
          <h2 className="text-2xl font-extrabold text-paw-brown mb-3 leading-tight">
            {slide.title}
          </h2>

          {/* Body */}
          <p className="text-paw-brown/70 leading-relaxed mb-4">
            {slide.body}
          </p>

          {/* Hint */}
          {slide.hint && (
            <div className="bg-paw-cream rounded-xl px-4 py-3 mb-6">
              <p className="text-sm text-paw-brown/60 leading-snug">
                {slide.hint}
              </p>
            </div>
          )}

          {/* Progress dots */}
          <div className="flex items-center justify-center gap-1.5 mb-6">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`rounded-full transition-all ${
                  i === step
                    ? "w-5 h-2 bg-paw-orange"
                    : "w-2 h-2 bg-paw-brown/15 hover:bg-paw-brown/30"
                }`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex gap-3">
            {!isLast && (
              <button
                onClick={handleClose}
                className="flex-1 px-4 py-3 rounded-xl border border-paw-brown/15 text-paw-brown/60 text-sm font-semibold hover:bg-paw-cream transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={() => {
                if (isLast) {
                  handleClose();
                } else {
                  setStep((s) => s + 1);
                }
              }}
              className="flex-1 px-4 py-3 rounded-xl bg-paw-orange text-white text-sm font-bold hover:bg-paw-orange/90 transition-colors"
            >
              {isLast ? "Let's go!" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/** Returns true if the tour has never been shown */
export function shouldShowTour(): boolean {
  if (typeof window === "undefined") return false;
  return !localStorage.getItem(TOUR_KEY);
}

export { TOUR_KEY };
