import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { attachBookableRecording } from "@/lib/bookable";
import { twimlSayHangup, verifyTwilioSignature } from "@/lib/twilio";

export async function POST(req: NextRequest) {
  const formData = await req.formData().catch(() => null);
  if (!formData || !verifyTwilioSignature(req, formData)) {
    return twimlSayHangup("Thanks. Goodbye.");
  }

  const sessionId = new URL(req.url).searchParams.get("sid");
  const recordingUrl = String(formData.get("RecordingUrl") || "").trim();

  if (sessionId && recordingUrl) {
    const session = await prisma.bookableSession.findUnique({
      where: { id: sessionId },
    });
    if (session) {
      await attachBookableRecording(session.id, recordingUrl).catch((error) => {
        console.error("[voice/recording] failed:", error);
      });
    }
  }

  return twimlSayHangup("Thanks. The shop will call you back.");
}
