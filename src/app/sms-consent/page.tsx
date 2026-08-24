import type { Metadata } from "next";
import Link from "next/link";
import { BrandLogo } from "@/components/brand-logo";

export const metadata: Metadata = {
  title: "SMS Consent & Opt-In | Call Slot",
  description:
    "How customers consent to receive text messages through Call Slot-powered shops.",
};

export default function SmsConsentPage() {
  return (
    <main className="min-h-screen bg-paper text-ink">
      <div className="mx-auto max-w-[680px] px-6 pt-[60px] pb-[100px]">
        <BrandLogo />

        <h1 className="mt-12 font-display text-[clamp(1.8rem,5vw,2.6rem)] leading-[1.15] tracking-tight">
          SMS Consent &amp; Opt-In
        </h1>
        <p className="mb-12 border-b border-line pb-12 text-sm text-muted">
          How customers consent to receive text messages through Call Slot-powered shops
        </p>

        <div className="mb-10 border border-line border-l-accent bg-surface p-8">
          <p className="text-[17px] leading-[1.8]">
            By providing your phone number when booking an appointment at a Call Slot-powered
            shop, you agree to receive SMS appointment confirmations, reminders, and booking-related
            notifications from <strong>Call Slot</strong> on behalf of the shop. Message and data rates may apply. Reply{" "}
            <strong>STOP</strong> to opt out at any time. Reply <strong>HELP</strong> for help.
          </p>
        </div>

        <h2 className="mb-2.5 mt-10 font-display text-[1.35rem]">
          How Opt-In Works
        </h2>
        <p className="mb-3.5 text-ink/80">
          When a customer books an appointment — either by calling the shop or in person — the
          shop collects their phone number and presents the following consent notice before
          confirming the booking:
        </p>

        <div className="my-8 border border-line bg-surface px-8 py-7">
          <div className="mb-4">
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Your Name
            </label>
            <div className="border border-line bg-paper px-3.5 py-2.5 text-[15px] text-muted">
              e.g. Jane Smith
            </div>
          </div>
          <div className="mb-4">
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Pet&apos;s Name
            </label>
            <div className="border border-line bg-paper px-3.5 py-2.5 text-[15px] text-muted">
              e.g. Biscuit
            </div>
          </div>
          <div className="mb-4">
            <label className="mb-1.5 block text-[11px] font-medium uppercase tracking-[0.12em] text-muted">
              Mobile Phone Number
            </label>
            <div className="border border-line bg-paper px-3.5 py-2.5 text-[15px] text-muted">
              e.g. (619) 555-0100
            </div>
          </div>
          <div className="mt-5 flex items-start gap-3 border-t border-line pt-5">
            <div className="mt-0.5 flex h-[18px] w-[18px] min-w-[18px] items-center justify-center rounded-[2px] border border-line bg-paper text-xs text-transparent">
              &#10003;
            </div>
            <div className="text-sm leading-relaxed text-ink/80">
              I agree to receive SMS appointment confirmations and reminders from{" "}
              <strong>Call Slot</strong> on behalf of this shop. Message &amp; data rates may
              apply. I can reply <strong>STOP</strong> to opt out at any time.
            </div>
          </div>
        </div>

        <p className="mt-2 text-[13px] italic text-muted">
          The above represents the consent workflow presented to customers at the time of booking.
          No messages are sent until consent is collected.
        </p>

        <h2 className="mb-2.5 mt-10 font-display text-[1.35rem]">
          Program Details
        </h2>
        <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { label: "Program Name", value: "Call Slot Appointment Notifications" },
            { label: "Message Frequency", value: "1\u20133 messages per appointment" },
            { label: "To Opt Out", value: "Reply STOP to any message" },
            { label: "For Help", value: "Reply HELP or email support@ringpaw.com" },
          ].map((item) => (
            <div key={item.label} className="border border-line bg-surface p-5">
              <div className="mb-1.5 text-[11px] uppercase tracking-[0.12em] text-muted">
                {item.label}
              </div>
              <div className="text-[15px] font-medium">{item.value}</div>
            </div>
          ))}
        </div>

        <h2 className="mb-2.5 mt-10 font-display text-[1.35rem]">
          What Messages Look Like
        </h2>
        <ul className="mb-3.5 ml-5 list-disc">
          <li className="mb-2 text-ink/80">
            Hi [Name], this is Call Slot confirming your appointment on [Date] at
            [Time]. Reply STOP to opt out.
          </li>
          <li className="mb-2 text-ink/80">
            Reminder from Call Slot: your appointment is tomorrow at [Time]. Reply STOP to opt
            out.
          </li>
          <li className="mb-2 text-ink/80">
            Call Slot: you&apos;re all set for pickup. Reply STOP to opt out.
          </li>
        </ul>

        <h2 className="mb-2.5 mt-10 font-display text-[1.35rem]">
          Your Rights
        </h2>
        <p className="mb-3.5 text-ink/80">
          You can opt out at any time by replying <strong>STOP</strong> to any message. You will
          receive one confirmation and no further messages. For help, reply <strong>HELP</strong> or
          contact{" "}
          <a href="mailto:support@ringpaw.com" className="text-accent underline">
            support@ringpaw.com
          </a>
          .
        </p>
        <p className="text-ink/80">
          For more information, see our{" "}
          <Link href="/privacy-policy" className="text-accent underline">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="text-accent underline">
            Terms &amp; Conditions
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
