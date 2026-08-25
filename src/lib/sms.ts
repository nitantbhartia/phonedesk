import { getTwilioClient } from "@/lib/twilio-rest";

export type SmsProvider = "disabled" | "twilio";

export function getSmsProvider(): SmsProvider {
  if (process.env.SMS_ENABLED === "false") {
    return "disabled";
  }

  return Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
  )
    ? "twilio"
    : "disabled";
}

export function isSmsEnabled(): boolean {
  return getSmsProvider() !== "disabled";
}

export function shouldAttachRetellSmsWebhook(): boolean {
  return isSmsEnabled();
}

/**
 * Send an outbound SMS via Twilio.
 */
export async function sendSms(
  to: string,
  body: string,
  from?: string,
  { retries = 2 }: { retries?: number } = {}
): Promise<void> {
  const provider = getSmsProvider();
  if (provider === "disabled") {
    console.log("[SMS] disabled - skipping send to:", to);
    return;
  }

  const fromNumber = from || process.env.TWILIO_PHONE_NUMBER;
  if (!fromNumber) {
    throw new Error("From number is required for Twilio SMS (set TWILIO_PHONE_NUMBER as fallback)");
  }

  let lastError: Error = new Error("Failed to send SMS");
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const twilioClient = await getTwilioClient();
      await twilioClient.messages.create({ to, from: fromNumber, body });
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
