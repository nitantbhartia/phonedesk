import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { normalizePhoneNumber } from "@/lib/phone";
import { getCRMWithFallback } from "@/crm/withFallback";

// Retell custom tool: writes a post-call summary note to the customer's CRM record.
// Called by the AI before end_call on every call.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-retell-signature") || "";

  if (!isRetellWebhookValid(rawBody, signature, req.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { args?: Record<string, string>; call?: Record<string, string> };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { args, call } = body;

  const { square_customer_id: squareCustomerId, outcome, note } = args || {};

  if (!note) {
    return NextResponse.json({ result: "Note skipped — no content provided." });
  }

  const calledNumber = normalizePhoneNumber(call?.to_number);
  const phoneRecord = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: true },
      })
    : null;

  if (!phoneRecord?.business) {
    return NextResponse.json({ result: "Call note skipped — business not resolved." });
  }

  const businessId = phoneRecord.business.id;
  const formattedNote = `[PawAnswers] ${outcome || "call"} — ${note} (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})`;

  // Write to Square CRM if we have a Square customer ID
  if (squareCustomerId) {
    try {
      const crm = await getCRMWithFallback(businessId);
      await crm.addNote(squareCustomerId, formattedNote);
    } catch (err) {
      console.error("[add-call-note] Failed to write note to Square:", err);
      // Non-blocking — fall through to internal DB write
    }
  }

  // Also update the internal Customer record for fallback/history
  const callerPhone = normalizePhoneNumber(call?.from_number);
  if (callerPhone) {
    try {
      await prisma.customer.updateMany({
        where: {
          businessId,
          phone: callerPhone,
        },
        data: {
          lastCallSummary: note,
          lastContactAt: new Date(),
          lastOutcome: outcome || "NO_BOOKING",
        },
      });
    } catch (err) {
      console.error("[add-call-note] Failed to update internal customer record:", err);
    }
  }

  return NextResponse.json({ result: "Call note saved." });
}
