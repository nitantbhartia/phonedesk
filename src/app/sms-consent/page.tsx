import type { Metadata } from "next";
import Link from "next/link";
import { DM_Sans, DM_Serif_Display } from "next/font/google";

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500"],
  display: "swap",
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: "400",
  display: "swap",
});

export const metadata: Metadata = {
  title: "SMS Consent & Opt-In | RingPaw",
  description:
    "How pet owners consent to receive text messages through RingPaw-powered salons.",
};

export default function SmsConsentPage() {
  return (
    <main className={`min-h-screen bg-[#faf9f7] text-[#1a1a1a] ${dmSans.className}`}>
      <div className="mx-auto max-w-[680px] px-6 pt-[60px] pb-[100px]">
        <Link
          href="/"
          className={`mb-12 inline-block text-sm font-medium uppercase tracking-[0.12em] text-[#2d6a4f] no-underline ${dmSerif.className}`}
        >
          RingPaw
        </Link>

        <h1
          className={`mb-2 text-[clamp(1.8rem,5vw,2.6rem)] leading-[1.15] ${dmSerif.className}`}
        >
          SMS Consent &amp; Opt-In
        </h1>
        <p className="mb-12 border-b border-[#e4e0d8] pb-12 text-sm text-[#6b6b6b]">
          How pet owners consent to receive text messages through RingPaw-powered salons
        </p>

        {/* Consent box */}
        <div className="mb-10 rounded-lg border border-[#e4e0d8] border-l-4 border-l-[#2d6a4f] bg-white p-8">
          <p className="text-[17px] leading-[1.8] text-[#1a1a1a]">
            By providing your phone number when booking an appointment at a RingPaw-powered grooming
            salon, you agree to receive SMS appointment confirmations, reminders, and booking-related
            notifications from that salon. Message and data rates may apply. Reply{" "}
            <strong>STOP</strong> to opt out at any time. Reply <strong>HELP</strong> for help.
          </p>
        </div>

        <h2
          className={`mb-2.5 mt-10 text-[1.15rem] ${dmSerif.className}`}
        >
          How Opt-In Works
        </h2>
        <p className="mb-3.5 text-[#2e2e2e]">
          When a pet owner books an appointment — either by calling the salon or in person — the
          salon collects their phone number and presents the following consent notice before
          confirming the booking:
        </p>

        {/* Form mock */}
        <div className="my-8 rounded-lg border border-[#e4e0d8] bg-white px-8 py-7">
          <div className="mb-4">
            <label className="mb-1.5 block text-[13px] font-medium uppercase tracking-[0.05em] text-[#6b6b6b]">
              Your Name
            </label>
            <div className="rounded-[5px] border border-[#e4e0d8] bg-[#faf9f7] px-3.5 py-2.5 text-[15px] text-[#aaa]">
              e.g. Jane Smith
            </div>
          </div>
          <div className="mb-4">
            <label className="mb-1.5 block text-[13px] font-medium uppercase tracking-[0.05em] text-[#6b6b6b]">
              Pet&apos;s Name
            </label>
            <div className="rounded-[5px] border border-[#e4e0d8] bg-[#faf9f7] px-3.5 py-2.5 text-[15px] text-[#aaa]">
              e.g. Biscuit
            </div>
          </div>
          <div className="mb-4">
            <label className="mb-1.5 block text-[13px] font-medium uppercase tracking-[0.05em] text-[#6b6b6b]">
              Mobile Phone Number
            </label>
            <div className="rounded-[5px] border border-[#e4e0d8] bg-[#faf9f7] px-3.5 py-2.5 text-[15px] text-[#aaa]">
              e.g. (619) 555-0100
            </div>
          </div>
          <div className="mt-5 flex items-start gap-3 border-t border-[#e4e0d8] pt-5">
            <div className="mt-0.5 flex h-[18px] w-[18px] min-w-[18px] items-center justify-center rounded-[3px] border-2 border-[#2d6a4f] bg-[#e8f5ee] text-xs text-[#2d6a4f]">
              &#10003;
            </div>
            <div className="text-sm leading-relaxed text-[#2e2e2e]">
              I agree to receive SMS appointment confirmations and reminders from this salon via
              RingPaw. Message &amp; data rates may apply. I can reply <strong>STOP</strong> to opt
              out at any time.
            </div>
          </div>
        </div>

        <p className="mt-2 text-[13px] italic text-[#6b6b6b]">
          The above represents the consent workflow presented to pet owners at the time of booking.
          No messages are sent until consent is collected.
        </p>

        <h2
          className={`mb-2.5 mt-10 text-[1.15rem] ${dmSerif.className}`}
        >
          Program Details
        </h2>
        <div className="my-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          {[
            { label: "Program Name", value: "RingPaw Appointment Notifications" },
            { label: "Message Frequency", value: "1\u20133 messages per appointment" },
            { label: "To Opt Out", value: "Reply STOP to any message" },
            { label: "For Help", value: "Reply HELP or email support@ringpaw.com" },
          ].map((item) => (
            <div key={item.label} className="rounded-lg border border-[#e4e0d8] bg-white p-5">
              <div className="mb-1.5 text-xs uppercase tracking-[0.06em] text-[#6b6b6b]">
                {item.label}
              </div>
              <div className="text-[15px] font-medium text-[#1a1a1a]">{item.value}</div>
            </div>
          ))}
        </div>

        <h2
          className={`mb-2.5 mt-10 text-[1.15rem] ${dmSerif.className}`}
        >
          What Messages Look Like
        </h2>
        <ul className="mb-3.5 ml-5 list-disc">
          <li className="mb-2 text-[#2e2e2e]">
            Hi [Name], this is [Salon] confirming [Pet]&apos;s grooming on [Date] at [Time]. Reply
            STOP to opt out.
          </li>
          <li className="mb-2 text-[#2e2e2e]">
            Reminder from [Salon]: [Pet]&apos;s appointment is tomorrow at [Time]. Reply STOP to opt
            out.
          </li>
          <li className="mb-2 text-[#2e2e2e]">
            [Salon]: [Pet] is ready for pickup! Reply STOP to opt out.
          </li>
        </ul>

        <h2
          className={`mb-2.5 mt-10 text-[1.15rem] ${dmSerif.className}`}
        >
          Your Rights
        </h2>
        <p className="mb-3.5 text-[#2e2e2e]">
          You can opt out at any time by replying <strong>STOP</strong> to any message. You will
          receive one confirmation and no further messages. For help, reply <strong>HELP</strong> or
          contact{" "}
          <a href="mailto:support@ringpaw.com" className="text-[#2d6a4f] underline">
            support@ringpaw.com
          </a>
          .
        </p>
        <p className="text-[#2e2e2e]">
          For more information, see our{" "}
          <Link href="/privacy-policy" className="text-[#2d6a4f] underline">
            Privacy Policy
          </Link>{" "}
          and{" "}
          <Link href="/terms" className="text-[#2d6a4f] underline">
            Terms &amp; Conditions
          </Link>
          .
        </p>
      </div>
    </main>
  );
}
