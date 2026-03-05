import twilio from "twilio";

const accountSid = process.env.TWILIO_ACCOUNT_SID;
const authToken = process.env.TWILIO_AUTH_TOKEN;

export function getTwilioClient() {
  if (!accountSid || !authToken) {
    throw new Error("Twilio credentials not configured");
  }
  return twilio(accountSid, authToken);
}

export async function provisionPhoneNumber(areaCode: string) {
  const client = getTwilioClient();
  const appUrl = process.env.NEXT_PUBLIC_APP_URL;

  // Search for available local numbers
  const available = await client.availablePhoneNumbers("US").local.list({
    areaCode: parseInt(areaCode),
    voiceEnabled: true,
    smsEnabled: true,
    limit: 1,
  });

  if (available.length === 0) {
    // Fallback: try nearby area codes
    const fallback = await client.availablePhoneNumbers("US").local.list({
      voiceEnabled: true,
      smsEnabled: true,
      limit: 1,
    });
    if (fallback.length === 0) {
      throw new Error("No phone numbers available");
    }
    available.push(fallback[0]);
  }

  // Purchase the number
  const purchased = await client.incomingPhoneNumbers.create({
    phoneNumber: available[0].phoneNumber,
    voiceUrl: `${appUrl}/api/vapi/webhook`,
    voiceMethod: "POST",
    smsUrl: `${appUrl}/api/sms/webhook`,
    smsMethod: "POST",
  });

  return {
    phoneNumber: purchased.phoneNumber,
    sid: purchased.sid,
    capabilities: {
      voice: true,
      sms: true,
    },
  };
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
