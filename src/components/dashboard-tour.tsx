"use client";

import { useEffect, useCallback, useState } from "react";

export const TOUR_KEY = "ringpaw_tour_v1";

const TOOLTIP_W = 320;
const TOOLTIP_H_EST = 260; // estimated max tooltip height for overflow detection
const SPOT_PAD = 10; // padding around the highlighted element
const GAP = 16;      // gap between spotlight edge and tooltip card

interface Step {
  targetId?: string;
  title: string;
  body: string;
  hint?: string;
  side?: "top" | "bottom" | "left" | "right";
}

const STEPS: Step[] = [
  {
    title: "Welcome to your dashboard",
    body: "Your AI receptionist is live. Let's take a 60-second tour so you know exactly where everything is.",
    hint: "Click Next to move through — or Skip if you'd rather explore on your own.",
  },
  {
    targetId: "tour-calls",
    title: "Calls Handled",
    body: "Every call your AI answered this week. Each one was a call that would have gone to voicemail — handled instead.",
    side: "bottom",
  },
  {
    targetId: "tour-revenue",
    title: "Revenue Protected",
    body: "Estimated revenue your AI saved this week — confirmed bookings multiplied by your average service price. Keep your services updated in AI Settings so this stays accurate.",
    side: "bottom",
  },
  {
    targetId: "tour-calllog",
    title: "Recent Call Log",
    body: "Every call your AI handled is logged here with caller name, outcome, and duration. Click any row to open the full transcript and see exactly what was said.",
    side: "top",
  },
  {
    targetId: "tour-nav-today",
    title: "Today's Schedule",
    body: "Your live appointment list for the day. Tap the status badge as pets check in, get groomed, and are picked up — customers get an automated SMS at each step.",
    side: "right",
  },
  {
    targetId: "tour-nav-ai",
    title: "AI Settings",
    body: "Customize your AI's voice, personality, services, and booking mode. Toggle any service as an \"Add-on\" to let the AI upsell it to returning customers. Changes sync instantly.",
    side: "right",
  },
  {
    title: "You're all set!",
    body: "Make a test call to your RingPaw number to hear your AI in action. You can replay this tour anytime via the \"Take a tour\" link on your dashboard.",
  },
];

interface Rect {
  top: number;
  left: number;
  width: number;
  height: number;
}

function measureElement(targetId: string): Rect | null {
  const el = document.querySelector(`[data-tour="${targetId}"]`);
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width === 0 || r.height === 0) return null;
  // Out of viewport
  if (r.bottom < 0 || r.right < 0 || r.top > window.innerHeight || r.left > window.innerWidth) return null;
  return { top: r.top, left: r.left, width: r.width, height: r.height };
}

function computeTooltipStyle(
  rect: Rect,
  side: Step["side"],
): React.CSSProperties {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(TOOLTIP_W, vw - 32);
  const clampLeft = (l: number) => Math.max(16, Math.min(l, vw - w - 16));
  const clampTop = (t: number) => Math.max(16, Math.min(t, vh - TOOLTIP_H_EST - 16));
  const spotTop = rect.top - SPOT_PAD;
  const spotLeft = rect.left - SPOT_PAD;
  const spotW = rect.width + SPOT_PAD * 2;
  const spotH = rect.height + SPOT_PAD * 2;
  const centerLeft = clampLeft(spotLeft + spotW / 2 - w / 2);

  switch (side) {
    case "bottom": {
      const below = spotTop + spotH + GAP;
      // Flip to above if tooltip would overflow the bottom
      const top = below + TOOLTIP_H_EST + 16 > vh
        ? Math.max(16, spotTop - GAP - TOOLTIP_H_EST)
        : below;
      return { top, left: centerLeft, width: w };
    }
    case "top": {
      const above = spotTop - GAP - TOOLTIP_H_EST;
      // Flip to below if tooltip would overflow the top
      const top = above < 16 ? spotTop + spotH + GAP : above;
      return { top: clampTop(top), left: centerLeft, width: w };
    }
    case "right":
      return { top: clampTop(spotTop + spotH / 2 - TOOLTIP_H_EST / 2), left: Math.min(spotLeft + spotW + GAP, vw - w - 16), width: w };
    case "left":
      return { top: clampTop(spotTop + spotH / 2 - TOOLTIP_H_EST / 2), left: Math.max(16, spotLeft - w - GAP), width: w };
    default: {
      const below = spotTop + spotH + GAP;
      const top = below + TOOLTIP_H_EST + 16 > vh
        ? Math.max(16, spotTop - GAP - TOOLTIP_H_EST)
        : below;
      return { top, left: centerLeft, width: w };
    }
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
}

export function DashboardTour({ open, onClose }: Props) {
  const [step, setStep] = useState(0);
  const [spotlight, setSpotlight] = useState<Rect | null>(null);

  const currentStep = STEPS[step];
  const isLast = step === STEPS.length - 1;
  const hasTarget = !!currentStep.targetId;

  const measureTarget = useCallback(() => {
    if (!currentStep.targetId) {
      setSpotlight(null);
      return;
    }
    const rect = measureElement(currentStep.targetId);
    if (rect) {
      setSpotlight(rect);
    } else {
      // Not visible yet — scroll to it and remeasure
      const el = document.querySelector(`[data-tour="${currentStep.targetId}"]`);
      if (el) {
        el.scrollIntoView({ behavior: "smooth", block: "center" });
        setTimeout(() => {
          setSpotlight(measureElement(currentStep.targetId!));
        }, 350);
      } else {
        setSpotlight(null);
      }
    }
  }, [currentStep.targetId]);

  // Reset to step 0 when opened
  useEffect(() => {
    if (open) setStep(0);
  }, [open]);

  // Measure target element whenever step changes
  useEffect(() => {
    if (!open) return;
    setSpotlight(null); // clear while transitioning
    const t = setTimeout(measureTarget, 50);
    return () => clearTimeout(t);
  }, [open, step, measureTarget]);

  // Remeasure on resize
  useEffect(() => {
    if (!open) return;
    const handler = () => measureTarget();
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, [open, measureTarget]);

  if (!open) return null;

  function handleClose() {
    localStorage.setItem(TOUR_KEY, "done");
    onClose();
  }

  function goNext() {
    if (isLast) handleClose();
    else setStep((s) => s + 1);
  }

  function goPrev() {
    if (step > 0) setStep((s) => s - 1);
  }

  const showSpotlight = hasTarget && spotlight !== null;

  // Tooltip position: centred modal for intro/outro or unlocated targets; otherwise next to spotlight
  const tooltipPosition: React.CSSProperties = showSpotlight
    ? { position: "fixed", ...computeTooltipStyle(spotlight!, currentStep.side) }
    : {
        position: "fixed",
        top: "50%",
        left: "50%",
        transform: "translate(-50%, -50%)",
        width: Math.min(TOOLTIP_W, (typeof window !== "undefined" ? window.innerWidth : 400) - 32),
      };

  return (
    <div className="fixed inset-0 z-[9999]" style={{ pointerEvents: "none" }}>
      {/* Backdrop — only covers screen when no spotlight */}
      {!showSpotlight && (
        <div
          className="absolute inset-0 bg-black/60"
          style={{ backdropFilter: "blur(2px)", pointerEvents: "auto" }}
        />
      )}

      {/* Spotlight cutout — box-shadow creates the dark overlay with transparent hole */}
      {showSpotlight && spotlight && (
        <div
          style={{
            position: "fixed",
            top: spotlight.top - SPOT_PAD,
            left: spotlight.left - SPOT_PAD,
            width: spotlight.width + SPOT_PAD * 2,
            height: spotlight.height + SPOT_PAD * 2,
            borderRadius: 18,
            boxShadow: "0 0 0 9999px rgba(0, 0, 0, 0.65)",
            outline: "2.5px solid rgba(255,180,0,0.5)",
            outlineOffset: "0px",
            transition: "all 0.25s ease",
            pointerEvents: "none",
          }}
        />
      )}

      {/* Tooltip card */}
      <div
        style={{ ...tooltipPosition, pointerEvents: "auto" }}
        className="bg-white rounded-3xl shadow-2xl overflow-y-auto"
        style={{ maxHeight: typeof window !== "undefined" ? window.innerHeight - 32 : "90vh" }}
      >
        {/* Progress bar */}
        <div className="h-1 bg-gray-100">
          <div
            className="h-full bg-paw-orange transition-all duration-300"
            style={{ width: `${((step + 1) / STEPS.length) * 100}%` }}
          />
        </div>

        <div className="p-6">
          {/* Step counter */}
          <p className="text-[10px] font-bold uppercase tracking-widest text-paw-brown/40 mb-1">
            {step + 1} of {STEPS.length}
          </p>

          {/* Title */}
          <h2 className="text-lg font-extrabold text-paw-brown mb-2 leading-snug">
            {currentStep.title}
          </h2>

          {/* Body */}
          <p className="text-sm text-paw-brown/70 leading-relaxed mb-3">
            {currentStep.body}
          </p>

          {/* Hint */}
          {currentStep.hint && (
            <div className="bg-paw-cream rounded-xl px-3 py-2 mb-3">
              <p className="text-xs text-paw-brown/60">{currentStep.hint}</p>
            </div>
          )}

          {/* Dot nav */}
          <div className="flex items-center gap-1.5 mb-4">
            {STEPS.map((_, i) => (
              <button
                key={i}
                onClick={() => setStep(i)}
                className={`rounded-full transition-all ${
                  i === step
                    ? "w-4 h-2 bg-paw-orange"
                    : "w-2 h-2 bg-paw-brown/15 hover:bg-paw-brown/30"
                }`}
              />
            ))}
          </div>

          {/* Buttons */}
          <div className="flex gap-2">
            {step > 0 && (
              <button
                onClick={goPrev}
                className="px-3 py-2 rounded-xl border border-paw-brown/15 text-paw-brown/60 text-xs font-bold hover:bg-paw-cream transition-colors"
              >
                ← Back
              </button>
            )}
            {!isLast && (
              <button
                onClick={handleClose}
                className="px-3 py-2 rounded-xl text-paw-brown/40 text-xs font-semibold hover:bg-paw-cream transition-colors"
              >
                Skip
              </button>
            )}
            <button
              onClick={goNext}
              className="flex-1 px-4 py-2 rounded-xl bg-paw-orange text-white text-sm font-bold hover:bg-paw-orange/90 transition-colors"
            >
              {isLast ? "Let's go!" : "Next →"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function shouldShowTour(): boolean {
  if (typeof window === "undefined") return false;
  return !localStorage.getItem(TOUR_KEY);
}
