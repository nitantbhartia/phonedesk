import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";
import twilio from "twilio";

let client: ReturnType<typeof twilio> | null = null;

function getTwilioCredentials() {
  const accountSid = process.env.TWILIO_ACCOUNT_SID?.trim();
  const authToken = process.env.TWILIO_AUTH_TOKEN?.trim();
  if (!accountSid || !authToken) {
    throw new Error("TWILIO_ACCOUNT_SID and TWILIO_AUTH_TOKEN must be set");
  }
  return { accountSid, authToken };
}

export function getTwilioClient() {
  if (!client) {
    const { accountSid, authToken } = getTwilioCredentials();
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

export function getTwilioWebhookUrls() {
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

  const matches = await getTwilioClient().incomingPhoneNumbers.list({
    phoneNumber: e164,
    limit: 20,
  });
  const incomingNumber = matches.find((number) => number.phoneNumber === e164);

  if (!incomingNumber) {
    throw new Error(`Twilio phone number ${e164} was not found`);
  }

  await getTwilioClient().incomingPhoneNumbers(incomingNumber.sid).update({
    ...getTwilioWebhookUrls(),
    voiceMethod: "POST",
    smsMethod: "POST",
  });

  return { sid: incomingNumber.sid, phoneNumber: e164 };
}

export async function purchaseTwilioPhoneNumber(options: {
  areaCode?: number;
}) {
  const available = await getTwilioClient()
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

  const purchased = await getTwilioClient().incomingPhoneNumbers.create({
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
  await getTwilioClient().incomingPhoneNumbers(sid).remove();
}

export function getPublicRequestUrl(req: NextRequest) {
  const url = new URL(req.url);
  const proto =
    req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return `${proto}://${host || url.host}${url.pathname}${url.search}`;
}

export function verifyTwilioSignature(req: NextRequest, formData: FormData) {
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  if (!authToken) {
    return true;
  }

  const signature = req.headers.get("x-twilio-signature");
  if (!signature) {
    return false;
  }

  const params = Array.from(formData.entries())
    .map(([key, value]) => [key, String(value)] as const)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));

  const data =
    getPublicRequestUrl(req) +
    params.map(([key, value]) => `${key}${value}`).join("");
  const expected = createHmac("sha1", authToken).update(data).digest("base64");

  const sigBuf = Buffer.from(signature, "utf8");
  const expBuf = Buffer.from(expected, "utf8");
  if (sigBuf.length !== expBuf.length) {
    return false;
  }

  return timingSafeEqual(sigBuf, expBuf);
}

export function twiml(body: string) {
  return new Response(
    `<?xml version="1.0" encoding="UTF-8"?><Response>${body}</Response>`,
    { status: 200, headers: { "Content-Type": "text/xml" } }
  );
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function twimlGather(say: string, action: string, numDigits = 1) {
  return twiml(
    `<Gather numDigits="${numDigits}" timeout="8" action="${escapeXml(action)}" method="POST"><Say voice="Polly.Joanna">${escapeXml(say)}</Say></Gather><Redirect method="POST">${escapeXml(action)}</Redirect>`
  );
}

export function twimlRecord(say: string, action: string, maxLength = 30) {
  return twiml(
    `<Say voice="Polly.Joanna">${escapeXml(say)}</Say><Record maxLength="${maxLength}" playBeep="true" action="${escapeXml(action)}" method="POST" />`
  );
}

export function twimlSayHangup(say: string) {
  return twiml(
    `<Say voice="Polly.Joanna">${escapeXml(say)}</Say><Hangup />`
  );
}
