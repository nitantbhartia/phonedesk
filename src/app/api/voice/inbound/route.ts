import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import { resolveInboundPath, startBookableCall } from "@/lib/bookable";
import {
  twiml,
  twimlGather,
  twimlSayHangup,
  verifyTwilioSignature,
} from "@/lib/twilio";

function voiceBase(req: NextRequest) {
  const url = new URL(req.url);
  const proto =
    req.headers.get("x-forwarded-proto") || url.protocol.replace(":", "");
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host");
  return `${proto}://${host || url.host}`;
}

export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  if (!formData) {
    return twimlSayHangup("Sorry, this line is unavailable.");
  }

  if (!verifyTwilioSignature(req, formData)) {
    return twiml("<Reject />");
  }

  const callSid = String(formData.get("CallSid") || "").trim();
  const from = normalizePhoneNumber(String(formData.get("From") || "")) || String(formData.get("From") || "");
  const to = normalizePhoneNumber(String(formData.get("To") || "")) || String(formData.get("To") || "");

  if (!callSid || !to) {
    return twimlSayHangup("Sorry, this line is unavailable.");
  }

  const phone = await prisma.phoneNumber.findFirst({
    where: { number: to, isActive: true },
    include: { business: true },
  });

  if (!phone?.business) {
    return twimlSayHangup("Sorry, this line is unavailable.");
  }

  if (resolveInboundPath(phone.business) !== "BOOKABLE_VOICEMAIL") {
    return twimlSayHangup("Please try this number again later.");
  }

  const call = await prisma.call.create({
    data: {
      businessId: phone.business.id,
      retellCallId: `twilio:${callSid}`,
      callerPhone: from || null,
      status: "IN_PROGRESS",
      summary: "Call Slot inbound",
    },
  });

  try {
    const { session, prompt } = await startBookableCall({
      businessId: phone.business.id,
      callSid,
      callerPhone: from,
      calledNumber: to,
      callId: call.id,
    });
    const action = `${voiceBase(req)}/api/voice/gather?sid=${encodeURIComponent(session.id)}`;
    return twimlGather(prompt.say, action);
  } catch (error) {
    console.error("[voice/inbound] failed:", error);
    return twimlSayHangup("Please leave a message after the tone.");
  }
}
