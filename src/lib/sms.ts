import twilio from "twilio";

let _client: ReturnType<typeof twilio> | null = null;

export type SmsProvider = "disabled" | "twilio" | "textbelt";

export function getSmsProvider(): SmsProvider {
  if (process.env.SMS_ENABLED === "false") {
    return "disabled";
  }

  const preferredProvider = process.env.SMS_PROVIDER?.toLowerCase();
  const twilioReady = Boolean(
    process.env.TWILIO_ACCOUNT_SID &&
      process.env.TWILIO_AUTH_TOKEN &&
      process.env.TWILIO_PHONE_NUMBER
  );
  const textbeltReady = Boolean(process.env.TEXTBELT_API_KEY);

  if (preferredProvider === "twilio") {
    return twilioReady ? "twilio" : "disabled";
  }

  if (preferredProvider === "textbelt") {
    return textbeltReady ? "textbelt" : "disabled";
  }

  if (twilioReady) {
    return "twilio";
  }

  if (textbeltReady) {
    return "textbelt";
  }

  return "disabled";
}

export function isSmsEnabled(): boolean {
  return getSmsProvider() !== "disabled";
}

export function shouldAttachRetellSmsWebhook(): boolean {
  return getSmsProvider() === "twilio";
}

function getClient() {
  if (!_client) {
    const sid = process.env.TWILIO_ACCOUNT_SID;
    const token = process.env.TWILIO_AUTH_TOKEN;
    console.log("[Twilio] Initializing client — SID:", sid ? `${sid.slice(0, 8)}...${sid.slice(-4)}` : "MISSING", "| Token:", token ? `${token.slice(0, 4)}...${token.slice(-4)}` : "MISSING");
    if (!sid || !token) {
      throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set");
    }
    _client = twilio(sid, token);
  }
  return _client;
}

async function sendTextbeltSms(to: string, body: string, from?: string) {
  const apiKey = process.env.TEXTBELT_API_KEY;
  if (!apiKey) {
    throw new Error("TEXTBELT_API_KEY must be set");
  }

  const params = new URLSearchParams({
    phone: to,
    message: body,
    key: apiKey,
    sender: process.env.TEXTBELT_SENDER || "RingPaw",
  });

  const appUrl = process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "");
  if (appUrl && from) {
    params.set("replyWebhookUrl", `${appUrl}/api/sms/webhook`);
    params.set("webhookData", from);
  }

  const response = await fetch("https://textbelt.com/text", {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const payload = (await response.json().catch(() => null)) as
    | { success?: boolean; error?: string }
    | null;

  if (!response.ok || !payload?.success) {
    throw new Error(payload?.error || `Textbelt SMS error (${response.status})`);
  }
}

/**
 * Send an outbound SMS via Twilio.
 * Temporary provider abstraction while Twilio registration is pending.
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

  if (provider === "textbelt") {
    await sendTextbeltSms(to, body, from);
    return;
  }

  const fromNumber = from || process.env.TWILIO_PHONE_NUMBER;
  console.log("[Twilio] sendSms — to:", to, "| from (param):", from || "none", "| from (env):", process.env.TWILIO_PHONE_NUMBER || "MISSING", "| using:", fromNumber || "NONE");
  if (!fromNumber) {
    throw new Error("From number is required for Twilio SMS (set TWILIO_PHONE_NUMBER as fallback)");
  }

  let lastError: Error = new Error("Failed to send SMS");
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
