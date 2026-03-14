import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { normalizePhoneNumber } from "@/lib/phone";
import { getCRMWithFallback } from "@/crm/withFallback";
import { resolveBusinessFromDemo } from "@/lib/demo-session";

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
  let phoneRecord = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: true },
      })
    : null;

  // Demo number fallback
  if (!phoneRecord && calledNumber) {
    const demoBusinessId = await resolveBusinessFromDemo(calledNumber);
    if (demoBusinessId) {
      const demoBusiness = await prisma.business.findUnique({ where: { id: demoBusinessId } });
      if (demoBusiness) {
        phoneRecord = { businessId: demoBusinessId, business: demoBusiness } as unknown as typeof phoneRecord;
      }
    }
  }

  if (!phoneRecord?.business) {
    return NextResponse.json({ result: "Call note skipped — business not resolved." });
  }

  const businessId = phoneRecord.business.id;
  const formattedNote = `[PawAnswers] ${outcome || "call"} — ${note} (${new Date().toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })})`;
  const isOutbound = call?.direction === "outbound";
  const customerPhone = normalizePhoneNumber(
    isOutbound ? call?.to_number : call?.from_number
  );

  // Write note to external CRM if the customer is synced there.
  // Square: customer ID comes from AI args (passed through from lookup-customer).
  // MoeGo: customer ID looked up from internal DB (no AI arg needed).
  try {
    const crm = await getCRMWithFallback(businessId);
    const crmType = crm.getCRMType();

    if (crmType === "square" && squareCustomerId) {
      await crm.addNote(squareCustomerId, formattedNote);
    } else if (crmType === "moego" && customerPhone) {
      const customer = await prisma.customer.findFirst({
        where: { businessId, phone: customerPhone },
        select: { moegoCustomerId: true },
      });
      if (customer?.moegoCustomerId) {
        await crm.addNote(customer.moegoCustomerId, formattedNote);
      }
    }
  } catch (err) {
    console.error("[add-call-note] Failed to write note to external CRM:", err);
    // Non-blocking — fall through to internal DB write
  }

  // Also update the internal Customer record for fallback/history
  if (customerPhone) {
    try {
      await prisma.customer.updateMany({
        where: {
          businessId,
          phone: customerPhone,
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
