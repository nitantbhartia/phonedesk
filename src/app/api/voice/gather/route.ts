import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { handleBookableDigit } from "@/lib/bookable";
import {
  twimlGather,
  twimlRecord,
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
  if (!formData || !verifyTwilioSignature(req, formData)) {
    return twimlSayHangup("Sorry, this line is unavailable.");
  }

  const sessionId = new URL(req.url).searchParams.get("sid");
  const digits = String(formData.get("Digits") || "").trim();

  if (!sessionId) {
    return twimlSayHangup("Sorry, this line is unavailable.");
  }

  const session = await prisma.bookableSession.findUnique({
    where: { id: sessionId },
  });
  if (!session) {
    return twimlSayHangup("Sorry, this line is unavailable.");
  }

  try {
    const { session: next, prompt } = await handleBookableDigit(session, digits);
    const base = voiceBase(req);
    if (prompt.record) {
      return twimlRecord(
        prompt.say,
        `${base}/api/voice/recording?sid=${encodeURIComponent(next.id)}`,
        30
      );
    }
    if (prompt.gather) {
      return twimlGather(
        prompt.say,
        `${base}/api/voice/gather?sid=${encodeURIComponent(next.id)}`
      );
    }
    return twimlSayHangup(prompt.say);
  } catch (error) {
    console.error("[voice/gather] failed:", error);
    return twimlSayHangup("Please leave a message after the tone.");
  }
}
