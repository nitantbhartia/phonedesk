import { Resend } from "resend";

const FROM_ADDRESS = process.env.RESEND_FROM ?? "RingPaw <noreply@ringpaw.com>";

function getResend(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("RESEND_API_KEY is not set.");
    }
    return null; // dev fallback
  }
  return new Resend(apiKey);
}

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const resend = getResend();
  if (!resend) {
    console.log(`\n[EMAIL DEV] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }
  await resend.emails.send({ from: FROM_ADDRESS, to, subject, html, text });
}

