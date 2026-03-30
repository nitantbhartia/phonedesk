import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "SMS Consent & Opt-In | RingPaw",
  description:
    "How pet owners consent to receive text messages through RingPaw-powered salons, including opt-in details, program information, and opt-out instructions.",
};

export default function SmsConsentPage() {
  return (
    <LegalPage
      eyebrow="RingPaw Legal"
      title="SMS Consent & Opt-In"
      effectiveDate="March 14, 2026"
      intro={[
        "How pet owners consent to receive text messages through RingPaw-powered salons.",
        'By providing your phone number when booking an appointment at a RingPaw-powered grooming salon, you agree to receive SMS appointment confirmations, reminders, and booking-related notifications from RingPaw on behalf of your grooming salon. Message and data rates may apply. Reply STOP to opt out at any time. Reply HELP for help.',
      ]}
      sections={[
        {
          title: "How Opt-In Works",
          body: [
            "When a pet owner books an appointment — either by calling the salon or in person — the salon collects their phone number and presents the following consent notice before confirming the booking:",
            '"I agree to receive SMS appointment confirmations and reminders from RingPaw on behalf of my grooming salon. Message & data rates may apply. I can reply STOP to opt out at any time."',
            "The above represents the consent workflow presented to pet owners at the time of booking. No messages are sent until consent is collected.",
          ],
        },
        {
          title: "Program Details",
          body: [
            "Program Name: RingPaw Appointment Notifications.",
            "Message Frequency: 1\u20133 messages per appointment.",
            "To Opt Out: Reply STOP to any message.",
            "For Help: Reply HELP or email support@ringpaw.com.",
          ],
        },
        {
          title: "What Messages Look Like",
          body: [
            "Hi [Name], this is RingPaw confirming [Pet]\u2019s grooming on [Date] at [Time]. Reply STOP to opt out.",
            "Reminder from RingPaw: [Pet]\u2019s appointment is tomorrow at [Time]. Reply STOP to opt out.",
            "RingPaw: [Pet] is ready for pickup! Reply STOP to opt out.",
          ],
        },
        {
          title: "Your Rights",
          body: [
            "You can opt out at any time by replying STOP to any message. You will receive one confirmation and no further messages. For help, reply HELP or contact support@ringpaw.com.",
            "Consent to receive SMS is not required as a condition of purchasing any goods or services. Standard message and data rates may apply depending on your carrier and plan.",
          ],
        },
      ]}
    />
  );
}
