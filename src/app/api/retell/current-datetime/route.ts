import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import { isRetellWebhookValid } from "@/lib/retell-auth";

/**
 * Retell custom tool: get_current_datetime
 * Returns the real current date and time in the business's local timezone.
 * The agent calls this at the start of every conversation so it never relies
 * on a stale date embedded in the system prompt.
 */
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-retell-signature") || "";

  if (!isRetellWebhookValid(rawBody, signature, req.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { call?: Record<string, string> };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { call } = body;

  // Resolve the business timezone from the called number
  const calledNumber = normalizePhoneNumber(call?.to_number);
  const phoneNum = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: { select: { timezone: true } } },
      })
    : null;

  const timezone =
    phoneNum?.business?.timezone || "America/Los_Angeles";

  const now = new Date();

  const dateLong = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);

  const timeStr = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(now);

  const dateYMD = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
  }).format(now);

  return NextResponse.json({
    result: `Today is ${dateLong} at ${timeStr} (${timezone}). Current date: ${dateYMD}.`,
    date: dateYMD,
    time: timeStr,
    timezone,
    datetime_long: `${dateLong} at ${timeStr}`,
  });
}
