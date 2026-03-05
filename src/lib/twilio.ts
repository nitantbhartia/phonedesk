import twilio from "twilio";

// Twilio is used only for SMS (outbound notifications + inbound owner commands).
// Phone numbers for voice calls are provisioned through Vapi (free).

function getTwilioClient() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured");
  }
  return twilio(accountSid, authToken);
}

export async function sendSms(to: string, body: string, from?: string) {
  const client = getTwilioClient();

  const message = await client.messages.create({
    to,
    body,
    ...(from
      ? { from }
      : { messagingServiceSid: process.env.TWILIO_MESSAGING_SERVICE_SID }),
  });

  return message;
}
