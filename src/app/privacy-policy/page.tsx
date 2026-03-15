import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Privacy Policy | RingPaw",
  description:
    "RingPaw privacy policy covering data collection, SMS use, and our commitment not to sell personal information to third parties.",
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage
      eyebrow="RingPaw Legal"
      title="Privacy Policy"
      effectiveDate="March 14, 2026"
      intro={[
        "This Privacy Policy explains how RingPaw collects, uses, stores, and protects information when you visit our website, sign up for our services, or communicate with us by phone or text message.",
        "By using RingPaw, you agree to the practices described here. If you do not agree with this Privacy Policy, please do not use our website or services.",
      ]}
      sections={[
        {
          title: "Information We Collect",
          body: [
            "We may collect personal information you provide directly to us, including your name, business name, email address, phone number, billing details, and any information you share when requesting a demo, creating an account, or contacting us.",
            "We may also collect service-related information such as call metadata, appointment details, message history, calendar availability, and usage activity needed to operate RingPaw and support your account.",
          ],
        },
        {
          title: "How We Use Information",
          body: [
            "We use your information to provide and improve RingPaw, respond to inquiries, manage accounts, process payments, deliver customer support, send operational updates, and maintain the safety and reliability of our platform.",
            "We may also use information to analyze product usage, troubleshoot technical issues, and comply with legal obligations.",
          ],
        },
        {
          title: "SMS And Phone Communications",
          body: [
            "If you provide a phone number, RingPaw may send text messages related to your account, service activity, appointment workflows, reminders, support, or other operational communications you request or authorize.",
            "SMS consent is not shared with third parties or affiliates for their own marketing purposes. Message frequency may vary based on your activity and account settings. Standard message and data rates may apply.",
          ],
        },
        {
          title: "Sharing Of Information",
          body: [
            "We may share information with service providers who help us operate RingPaw, such as hosting, communications, payment processing, analytics, and infrastructure vendors, but only as needed for them to perform services on our behalf.",
            "We do not sell your personal information to third parties. We do not share customer information with third parties for their own direct marketing or advertising purposes.",
          ],
        },
        {
          title: "Data Retention And Security",
          body: [
            "We retain information for as long as reasonably necessary to provide the service, meet contractual commitments, resolve disputes, enforce our agreements, and satisfy legal or compliance requirements.",
            "We use reasonable administrative, technical, and physical safeguards designed to protect your information. No method of transmission or storage is completely secure, so we cannot guarantee absolute security.",
          ],
        },
        {
          title: "Your Choices",
          body: [
            "You may request account updates or ask us to stop non-essential communications. You can also follow opt-out instructions in text messages where available, including replying STOP to supported SMS programs.",
            "If you would like to ask about your information or request changes, please contact RingPaw through https://ringpaw.com.",
          ],
        },
        {
          title: "Changes To This Policy",
          body: [
            "We may update this Privacy Policy from time to time. When we do, we will post the revised version on this page and update the effective date above. Continued use of RingPaw after changes become effective means you accept the revised policy.",
          ],
        },
      ]}
    />
  );
}
