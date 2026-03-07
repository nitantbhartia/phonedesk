import twilio from "twilio";

const client = twilio(
  process.env.TWILIO_ACCOUNT_SID,
  process.env.TWILIO_AUTH_TOKEN
);

/**
 * Send an outbound SMS via Twilio.
 * Drop-in replacement for the old Retell create-sms-chat path.
 */
export async function sendSms(
  to: string,
  body: string,
  from?: string,
  { retries = 2 }: { retries?: number } = {}
): Promise<void> {
  if (!from) {
    throw new Error("From number is required for Twilio SMS");
  }

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await client.messages.create({ to, from, body });
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
  }

  throw lastError ?? new Error("Failed to send SMS");
}
