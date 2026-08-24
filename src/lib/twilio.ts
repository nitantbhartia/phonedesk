import { createHmac, timingSafeEqual } from "node:crypto";
import { NextRequest } from "next/server";

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
