"use client";

import React from "react";
import { BrandLogo } from "@/components/brand-logo";

const STEPS = [
  { number: 1, label: "Business" },
  { number: 2, label: "Calendar" },
  { number: 3, label: "Hours" },
  { number: 4, label: "Services" },
  { number: 5, label: "Forwarding" },
  { number: 6, label: "Test call" },
];

interface OnboardingLayoutProps {
  currentStep: number;
  title: string;
  subtitle: string;
  proTip?: string;
  children: React.ReactNode;
  direction?: "forward" | "backward";
}

export function OnboardingLayout({
  currentStep,
  title,
  subtitle,
  proTip,
  children,
  direction = "forward",
}: OnboardingLayoutProps) {
  const currentLabel = STEPS.find((s) => s.number === currentStep)?.label ?? "";
  const progressPct = ((currentStep - 1) / (STEPS.length - 1)) * 100;

  return (
    <div className="min-h-screen bg-paper text-ink">
      <header className="border-b border-line">
        <div className="mx-auto flex max-w-[1180px] items-center justify-between px-6 py-5 sm:px-10 lg:px-12">
          <BrandLogo priority />
          <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-muted">Set up your line</span>
        </div>
      </header>

      <main className="mx-auto grid max-w-[1180px] gap-10 px-6 py-10 sm:px-10 sm:py-16 lg:grid-cols-[250px_1fr] lg:gap-20 lg:px-12">
        <aside className="lg:pt-3">
          <p className="studio-eyebrow mb-5"><span className="studio-eyebrow-line" />Onboarding</p>
          <p className="font-display text-4xl leading-[0.95] tracking-[-0.055em] sm:text-5xl">A few clear steps to a quieter phone.</p>
          <p className="mt-6 text-sm leading-[1.6] text-muted">Tell us about your shop, connect the calendar, and test the call. You can change any of it later.</p>
          <div className="mt-10 hidden border-t border-line pt-4 lg:block">
            <p className="studio-fact-label">Call Slot</p>
            <p className="mt-2 text-xs leading-[1.5] text-muted">Missed calls in. Real openings out.</p>
          </div>
        </aside>

        <section className="w-full border border-line bg-surface">
          <div className="border-b border-line bg-paper px-6 py-4 sm:px-9">
            <div className="mb-2 flex items-center justify-between">
              <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted">
                Sheet {currentStep} / {STEPS.length}
              </span>
              <span className="text-xs font-semibold text-ink">{currentLabel}</span>
            </div>
            <div className="h-1 bg-line">
              <div
                className="h-full bg-accent transition-all duration-500 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>

          <div className="px-5 py-7 sm:px-9 sm:py-10">
            <div
              key={currentStep}
              className={`animate-in fade-in duration-300 ${
                direction === "backward"
                  ? "slide-in-from-left-4"
                  : "slide-in-from-right-4"
              }`}
            >
              <h1 className="font-display text-4xl leading-[0.95] tracking-[-0.055em] text-ink sm:text-5xl">
                {title}
              </h1>
              <p className="mb-7 mt-3 max-w-xl text-sm leading-[1.6] text-muted">{subtitle}</p>

              {children}

              {proTip && (
                <div className="mt-7 flex items-start gap-3 border-t border-line pt-4">
                  <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-accent">Note</span>
                  <p className="text-xs leading-[1.5] text-muted">
                    <span className="font-semibold text-ink">Pro tip: </span>{proTip}
                  </p>
                </div>
              )}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export function OnboardingLabel({
  children,
  htmlFor,
  className = "",
  info,
}: {
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
  info?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={`block font-mono text-[10px] font-medium uppercase tracking-[0.16em] text-muted ${className}`}
      title={info}
    >
      {children}
    </label>
  );
}

export function OnboardingInput({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`onboarding-input w-full border border-line bg-paper px-3 py-2.5 text-[15px] text-ink placeholder:text-muted/60 ${className}`}
      {...props}
    />
  );
}

export function OnboardingSelect({
  children,
  className = "",
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`onboarding-input border border-line bg-paper px-3 py-2 text-sm text-ink ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function OnboardingFooter({
  onBack,
  onNext,
  nextLabel = "Continue",
  backLabel = "Back",
  showBack = true,
  nextDisabled = false,
  loading = false,
}: {
  onBack?: () => void;
  onNext?: () => void;
  nextLabel?: string;
  backLabel?: string;
  showBack?: boolean;
  nextDisabled?: boolean;
  loading?: boolean;
}) {
  return (
    <div className="mt-8 flex items-center justify-between border-t border-line pt-5">
      {showBack && onBack ? (
        <button type="button" onClick={onBack} className="text-[12px] tracking-[0.04em] text-muted hover:text-ink">
          {backLabel}
        </button>
      ) : (
        <div />
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || loading}
        className="bg-accent px-5 py-2.5 text-[12px] tracking-[0.04em] text-accent-foreground hover:bg-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? "Please wait…" : nextLabel}
      </button>
    </div>
  );
}
