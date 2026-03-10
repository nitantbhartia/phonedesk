"use client";

import React from "react";
import { InfoIcon } from "@/components/ui/info-icon";
import { BrandLogo } from "@/components/brand-logo";

const STEPS = [
  { number: 1, label: "Business Profile" },
  { number: 2, label: "Services" },
  { number: 3, label: "Calendar Sync" },
  { number: 4, label: "Get Number" },
  { number: 5, label: "Test Call" },
  { number: 6, label: "Choose Plan" },
  { number: 7, label: "Go Live" },
  { number: 8, label: "Call Forwarding" },
];

interface OnboardingLayoutProps {
  currentStep: number;
  title: string;
  subtitle: string;
  proTip?: string;
  children: React.ReactNode;
}

export function OnboardingLayout({
  currentStep,
  title,
  subtitle,
  proTip,
  children,
}: OnboardingLayoutProps) {
  return (
    <div className="min-h-screen bg-paw-sky antialiased flex flex-col items-center px-4 py-4 sm:px-6 sm:py-6 relative">
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
      <div className="mb-3 relative z-10">
        <BrandLogo mobileWidth={140} desktopWidth={180} priority />
      </div>

      {/* Main card */}
      <main className="w-full max-w-2xl bg-paw-cream rounded-[2rem] shadow-soft border-4 border-white relative z-10 overflow-hidden">
        {/* Step bar */}
        <div className="border-b border-paw-brown/5 bg-white/50">
          {/* Desktop: compact step dots with labels */}
          <div className="hidden sm:block px-6 py-3">
            <div className="relative flex items-start">
              <div className="absolute top-3 left-3 right-3 h-0.5 bg-paw-brown/10" />
              <div
                className="absolute top-3 left-3 h-0.5 bg-paw-brown/30 transition-all duration-300"
                style={{ width: `calc(${((currentStep - 1) / (STEPS.length - 1)) * 100}% * (100% - 1.5rem) / 100%)` }}
              />
              {STEPS.map((step) => {
                const isActive = step.number === currentStep;
                const isDone = step.number < currentStep;
                return (
                  <div key={step.number} className="flex-1 flex flex-col items-center">
                    <div className={`relative z-10 w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs transition-colors ${isActive || isDone ? "bg-paw-brown text-white" : "bg-white border-2 border-paw-brown/20 text-paw-brown/30"}`}>
                      {isDone ? (
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="20 6 9 17 4 12" />
                        </svg>
                      ) : step.number}
                    </div>
                    <span className={`mt-1 text-[9px] font-semibold text-center leading-tight px-0.5 transition-colors ${isActive ? "text-paw-brown" : isDone ? "text-paw-brown/50" : "text-paw-brown/20"}`}>
                      {step.label}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Mobile: progress bar */}
          <div className="sm:hidden px-4 py-3 space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="text-sm font-bold text-paw-brown">{STEPS.find((s) => s.number === currentStep)?.label}</span>
              <span className="text-xs font-bold text-paw-brown/40 tabular-nums">{currentStep} / {STEPS.length}</span>
            </div>
            <div className="h-1.5 bg-paw-brown/10 rounded-full overflow-hidden">
              <div className="h-full bg-paw-brown rounded-full transition-all duration-300" style={{ width: `${((currentStep - 1) / (STEPS.length - 1)) * 100}%` }} />
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="px-5 py-5 sm:px-8 sm:py-7">
          <div className="max-w-xl mx-auto">
            <h1 className="text-2xl font-extrabold text-paw-brown mb-1">{title}</h1>
            <p className="text-paw-brown/55 font-medium text-sm mb-5">{subtitle}</p>
            {children}
            {/* Pro Tip — inside card so it's never lost off-screen */}
            {proTip && (
              <div className="mt-5 flex items-start gap-3 p-3 bg-white/60 rounded-2xl border border-paw-brown/8">
                <span className="text-base shrink-0">💡</span>
                <p className="text-xs font-medium text-paw-brown/65">
                  <span className="font-bold text-paw-brown">Pro tip: </span>{proTip}
                </p>
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

/* Reusable form elements styled for onboarding */

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
      className={`text-sm font-bold text-paw-brown/70 uppercase tracking-wider block ${className}`}
    >
      <span className="inline-flex items-center gap-1.5">
        <span>{children}</span>
        {info ? <InfoIcon text={info} /> : null}
      </span>
    </label>
  );
}

export function OnboardingInput({
  className = "",
  ...props
}: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full px-5 py-4 bg-white border-2 border-paw-brown/5 rounded-2xl font-medium text-paw-brown transition-all placeholder:text-paw-brown/30 onboarding-input ${className}`}
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
      className={`bg-paw-sky/30 border-2 border-paw-brown/5 rounded-xl px-3 py-2 text-sm font-bold text-paw-brown onboarding-input ${className}`}
      {...props}
    >
      {children}
    </select>
  );
}

export function OnboardingFooter({
  onBack,
  onNext,
  nextLabel = "Continue Setup",
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
    <div className="pt-4 border-t border-paw-brown/5 flex items-center justify-between mt-2">
      {showBack && onBack ? (
        <button type="button" onClick={onBack} className="text-sm text-paw-brown/60 font-bold hover:text-paw-brown transition-colors">
          {backLabel}
        </button>
      ) : (
        <div />
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || loading}
        className="px-7 py-3 bg-paw-brown text-paw-cream rounded-full font-bold hover:bg-opacity-90 transition-all shadow-soft flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Please wait..." : nextLabel}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M5 12h14" /><path d="m12 5 7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
