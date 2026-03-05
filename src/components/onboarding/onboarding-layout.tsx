"use client";

import React from "react";

const STEPS = [
  { number: 1, label: "Business Profile" },
  { number: 2, label: "Services" },
  { number: 3, label: "Calendar Sync" },
  { number: 4, label: "Call Forwarding" },
  { number: 5, label: "Test Call" },
  { number: 6, label: "Go Live" },
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
    <div className="min-h-screen bg-paw-sky antialiased flex flex-col items-center py-12 px-6 relative">
      {/* Background decorations */}
      <div className="fixed inset-0 overflow-hidden pointer-events-none z-0">
        <svg
          className="leaf-shape absolute top-[-10%] left-[-5%] w-[500px] h-[500px] text-paw-amber"
          viewBox="0 0 200 200"
          fill="currentColor"
        >
          <path d="M100 0C60 40 20 80 0 140C40 130 80 110 100 200C120 110 160 130 200 140C180 80 140 40 100 0Z" />
        </svg>
        <svg
          className="leaf-shape absolute bottom-[-10%] right-[-5%] w-[600px] h-[600px] text-white opacity-60"
          viewBox="0 0 200 200"
          fill="currentColor"
        >
          <path d="M100 200C140 160 180 120 200 60C160 70 120 90 100 0C80 90 40 70 0 60C20 120 60 160 100 200Z" />
        </svg>
      </div>

      {/* Logo */}
      <div className="mb-8 flex items-center gap-2 relative z-10">
        <div className="w-8 h-8 bg-paw-brown rounded-full flex items-center justify-center text-paw-amber">
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
            <path d="M10 2v7.31" />
            <path d="M14 2v7.31" />
            <path d="M8.5 2h7" />
            <path d="M14 9.3a6.5 6.5 0 1 1-4 0" />
          </svg>
        </div>
        <span className="font-bold text-xl tracking-tight text-paw-brown">
          RingPaw<span className="text-paw-orange">.ai</span>
        </span>
      </div>

      {/* Main card */}
      <main className="w-full max-w-4xl bg-paw-cream rounded-[2.5rem] shadow-soft border-4 border-white relative z-10 overflow-hidden">
        {/* Step bar */}
        <div className="flex border-b border-paw-brown/5 bg-white/50 overflow-x-auto hide-scroll">
          {STEPS.map((step, i) => {
            const isActive = step.number === currentStep;
            const isDone = step.number < currentStep;
            return (
              <div
                key={step.number}
                className={`flex-1 min-w-0 px-4 sm:px-6 lg:px-8 py-4 flex items-center gap-3 ${
                  i < STEPS.length - 1 ? "border-r border-paw-brown/5" : ""
                } ${!isActive && !isDone ? "opacity-40" : ""}`}
              >
                <div
                  className={`w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm shrink-0 ${
                    isActive || isDone
                      ? "bg-paw-brown text-white"
                      : "bg-paw-sky text-paw-brown"
                  }`}
                >
                  {isDone ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <polyline points="20 6 9 17 4 12" />
                    </svg>
                  ) : (
                    step.number
                  )}
                </div>
                <span className="font-semibold text-paw-brown text-sm truncate hidden sm:inline">
                  {step.label}
                </span>
              </div>
            );
          })}
        </div>

        {/* Content */}
        <div className="p-8 sm:p-12">
          <div className="max-w-2xl mx-auto">
            <h1 className="text-3xl font-extrabold text-paw-brown mb-2">
              {title}
            </h1>
            <p className="text-paw-brown/60 font-medium mb-10">{subtitle}</p>
            {children}
          </div>
        </div>
      </main>

      {/* Pro Tip */}
      {proTip && (
        <div className="mt-12 max-w-lg text-center relative z-10">
          <div className="inline-flex items-center gap-4 p-4 bg-white/40 backdrop-blur-sm rounded-3xl border border-white/50">
            <div className="w-10 h-10 rounded-full bg-paw-amber/30 flex items-center justify-center text-xl shrink-0">
              💡
            </div>
            <p className="text-sm font-medium text-paw-brown/70 text-left">
              <span className="font-bold text-paw-brown">Pro Tip:</span>{" "}
              {proTip}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

/* Reusable form elements styled for onboarding */

export function OnboardingLabel({
  children,
  htmlFor,
  className = "",
}: {
  children: React.ReactNode;
  htmlFor?: string;
  className?: string;
}) {
  return (
    <label
      htmlFor={htmlFor}
      className={`text-sm font-bold text-paw-brown/70 uppercase tracking-wider block ${className}`}
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
    <div className="pt-6 border-t border-paw-brown/5 flex items-center justify-between">
      {showBack && onBack ? (
        <button
          type="button"
          onClick={onBack}
          className="text-paw-brown/60 font-bold hover:text-paw-brown transition-colors"
        >
          {backLabel}
        </button>
      ) : (
        <div />
      )}
      <button
        type="button"
        onClick={onNext}
        disabled={nextDisabled || loading}
        className="px-10 py-4 bg-paw-brown text-paw-cream rounded-full font-bold text-lg hover:bg-opacity-90 transition-all shadow-soft flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? "Please wait..." : nextLabel}
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M5 12h14" />
          <path d="m12 5 7 7-7 7" />
        </svg>
      </button>
    </div>
  );
}
