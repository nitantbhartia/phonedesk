import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";

export const metadata: Metadata = {
  title: "Terms & Conditions | Call Slot",
  description:
    "Call Slot terms and conditions for its SMS and service communications, including HELP and STOP instructions, message frequency, and message/data rate disclosures.",
};

export default function TermsPage() {
  return (
    <LegalPage
      eyebrow="Call Slot Legal"
      title="Terms & Conditions"
      effectiveDate="March 14, 2026"
      intro={[
        "These Terms & Conditions govern your use of Call Slot services and Call Slot text messaging programs. By opting in to receive messages from Call Slot or by using our services, you agree to these Terms & Conditions.",
        "For purposes of SMS communications, the program name is Call Slot Alerts. These messages may include account notices, appointment-related updates, support messages, onboarding steps, and other operational communications connected to your use of Call Slot.",
      ]}
      sections={[
        {
          title: "Program Description",
          body: [
            "Call Slot Alerts is an SMS program that sends conversational and operational messages related to your account, service activity, appointment workflows, reminders, follow-ups, and support interactions.",
            "Message frequency varies based on your activity, your business workflows, and the features you enable. Some users may receive recurring messages, while others receive messages only when specific events occur.",
          ],
        },
        {
          title: "Message And Data Rates",
          body: [
            "Message and data rates may apply to any text messages sent to or from Call Slot. Charges are determined by your mobile carrier and your wireless plan, and Call Slot is not responsible for those charges.",
          ],
        },
        {
          title: "Opting In And Consent",
          body: [
            "By providing your mobile number and agreeing to receive texts from Call Slot, you represent that you are the authorized user of that number and that you consent to receive text messages from us.",
            "Consent to receive text messages is not a condition of purchase. You are responsible for providing a valid mobile number and updating it if it changes.",
          ],
        },
        {
          title: "HELP And STOP Instructions",
          body: [
            "You can reply HELP at any time to receive assistance or additional information about the Call Slot SMS program.",
            "You can reply STOP at any time to opt out of SMS messages from that program. After you send STOP, you may receive a final confirmation text confirming that your opt-out request has been processed.",
          ],
        },
        {
          title: "Carrier And Delivery Disclaimer",
          body: [
            "Mobile carriers are not liable for delayed or undelivered messages. Message delivery depends on your carrier, wireless coverage, and your device's ability to receive messages.",
          ],
        },
        {
          title: "Acceptable Use",
          body: [
            "You agree not to use Call Slot in violation of law, regulation, carrier requirements, or the rights of others. We may suspend or terminate messaging access if we believe the service is being misused or used in a way that creates legal, security, or operational risk.",
          ],
        },
        {
          title: "Changes To These Terms",
          body: [
            "We may update these Terms & Conditions from time to time. When we do, we will post the revised version at this page and update the effective date above. Continued participation in Call Slot services or messaging after changes become effective means you accept the updated Terms & Conditions.",
          ],
        },
      ]}
    />
  );
}
