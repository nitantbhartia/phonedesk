import type twilio from "twilio";

let client: ReturnType<typeof twilio> | null = null;

function getTwilioCredentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set");
  }
  return { accountSid, authToken };
}

export async function getTwilioClient() {
  if (!client) {
    const { accountSid, authToken } = getTwilioCredentials();
    const { default: twilio } = await import("twilio");
    client = twilio(accountSid, authToken);
  }
  return client;
}

function getAppUrl() {
  return (
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXTAUTH_URL ||
    "https://ringpaw.com"
  ).replace(/\/+$/, "");
}

function getTwilioWebhookUrls() {
  const appUrl = getAppUrl();
  return {
    voiceUrl: `${appUrl}/api/voice/inbound`,
    smsUrl: `${appUrl}/api/sms/webhook`,
  };
}

export async function ensureTwilioWebhooks(e164: string) {
  if (!/^\+\d{10,15}$/.test(e164)) {
    throw new Error("Twilio phone number must be a valid E.164 number");
  }

  const twilioClient = await getTwilioClient();
  const matches = await twilioClient.incomingPhoneNumbers.list({
    phoneNumber: e164,
    limit: 20,
  });
  const incomingNumber = matches.find((number) => number.phoneNumber === e164);

  if (!incomingNumber) {
    throw new Error(`Twilio phone number ${e164} was not found`);
  }

  await twilioClient.incomingPhoneNumbers(incomingNumber.sid).update({
    ...getTwilioWebhookUrls(),
    voiceMethod: "POST",
    smsMethod: "POST",
  });

  return { sid: incomingNumber.sid, phoneNumber: e164 };
}

export async function purchaseTwilioPhoneNumber(options: {
  areaCode?: number;
}) {
  const twilioClient = await getTwilioClient();
  const available = await twilioClient
    .availablePhoneNumbers("US")
    .local.list({
      ...(options.areaCode ? { areaCode: options.areaCode } : {}),
      voiceEnabled: true,
      smsEnabled: true,
      limit: 1,
    });
  const candidate = available[0];

  if (!candidate?.phoneNumber) {
    throw new Error(
      options.areaCode
        ? `No Twilio local numbers are available for area code ${options.areaCode}`
        : "No Twilio local numbers are available"
    );
  }

  const purchased = await twilioClient.incomingPhoneNumbers.create({
    phoneNumber: candidate.phoneNumber,
    ...getTwilioWebhookUrls(),
    voiceMethod: "POST",
    smsMethod: "POST",
  });

  return {
    sid: purchased.sid,
    phoneNumber: purchased.phoneNumber || candidate.phoneNumber,
  };
}

export async function releaseTwilioPhoneNumber(sid: string) {
  const twilioClient = await getTwilioClient();
  await twilioClient.incomingPhoneNumbers(sid).remove();
}
