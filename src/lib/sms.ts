import twilio from "twilio";

let _client: ReturnType<typeof twilio> | null = null;

function getClient() {
  if (!_client) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    console.log("[Twilio] Initializing client", {
      hasSid: Boolean(sid),
      hasToken: Boolean(token),
    });
    if (!sid || !token) {
      throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set");
    }
    _client = twilio(sid, token);
  }
  return _client;
}

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
  const fromNumber = from || process.env.TWILIO_PHONE_NUMBER;
  if (!fromNumber) {
    throw new Error("From number is required for Twilio SMS (set TWILIO_PHONE_NUMBER as fallback)");
  }

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      await getClient().messages.create({ to, from: fromNumber, body });
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
