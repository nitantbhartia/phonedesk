import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { resolveShopFromCalledNumber } from "@/lib/bland-tools";

export const runtime = "nodejs";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

export async function POST(req: Request) {
  let body: unknown = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: true }); }
  const root = asRecord(body);
  const callId = asString(root.call_id) || asString(root.callId);
  const to = asString(root.to) || asString(root.inbound_number);
  const from = asString(root.from);
  const recordingUrl = asString(root.recording_url) || asString(root.recordingUrl);
  const summary = asString(root.summary) || asString(root.concatenated_transcript);
  console.info("[bland/webhook]", { callId, to, from, hasRecording: Boolean(recordingUrl) });
  try {
    const shop = await resolveShopFromCalledNumber(to);
    if (shop && callId) {
      const retellCallId = `bland:${callId}`;
      await prisma.call.upsert({
        where: { retellCallId },
        create: {
          businessId: shop.id,
          retellCallId,
          callerPhone: from || null,
          recordingUrl: recordingUrl || null,
          summary: summary ? summary.slice(0, 2000) : "Bland inbound",
          status: "COMPLETED",
        },
        update: {
          recordingUrl: recordingUrl || undefined,
          summary: summary ? summary.slice(0, 2000) : undefined,
          status: "COMPLETED",
        },
      });
    }
  } catch (error) {
    console.error("[bland/webhook] store failed:", error);
  }
  return NextResponse.json({ ok: true });
}
