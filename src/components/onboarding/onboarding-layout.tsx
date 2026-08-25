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
    <div className="flex min-h-screen flex-col bg-paper px-6 py-8 text-ink sm:px-8">
      <div className="mx-auto w-full max-w-xl">
        <BrandLogo className="text-[1.4rem] sm:text-[1.45rem]" />
      </div>

      <main className="mx-auto mt-10 w-full max-w-xl sm:mt-14">
        <div className="mb-7 flex items-baseline justify-between">
          <span className="font-mono text-[10px] uppercase tracking-[0.2em] text-muted">
            Step {currentStep} of {STEPS.length}
          </span>
          <span className="text-[12px] text-ink">{currentLabel}</span>
        </div>
        <div className="h-px overflow-hidden bg-line">
          <div
            className="h-full bg-accent transition-all duration-500 ease-out"
            style={{ width: `${progressPct}%` }}
          />
        </div>

        <div className="pt-10">
          <div
            key={currentStep}
            className={`animate-in fade-in duration-300 ${
              direction === "backward"
                ? "slide-in-from-left-4"
                : "slide-in-from-right-4"
            }`}
          >
            <h1 className="font-display text-[1.85rem] leading-[1.1] tracking-tight text-ink sm:text-[2.15rem]">
              {title}
            </h1>
            <p className="mb-8 mt-3 max-w-md text-[15px] leading-relaxed text-muted">{subtitle}</p>

              {children}

              {proTip && (
                <div className="mt-6 border-t border-line pt-3">
                  <p className="text-[12px] leading-relaxed text-muted">
                    <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-ink">Note </span>
                    {proTip}
                  </p>
                </div>
              )}
          </div>
        </div>
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
