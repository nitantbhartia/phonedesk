import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildCustomerContextSummary,
  deduplicatePets,
  lookupCustomerContext,
} from "@/lib/customer-memory";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { normalizePhoneNumber } from "@/lib/phone";
import { getCRMWithFallback } from "@/crm/withFallback";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-retell-signature") || "";

  if (!isRetellWebhookValid(rawBody, signature, req.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const { args, call } = body;

  const calledNumber = normalizePhoneNumber(call?.to_number);
  const phoneRecord = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: true },
      })
    : null;

  if (!phoneRecord?.business) {
    return NextResponse.json({
      result:
        "Customer context is unavailable because the business could not be resolved.",
      found: false,
      square_customer_id: null,
    });
  }

  const callerPhone = args?.caller_phone || call?.from_number;
  const businessId = phoneRecord.business.id;

  // Run internal DB lookup and Square CRM lookup concurrently
  const [internalContext, squareCustomer] = await Promise.allSettled([
    lookupCustomerContext(businessId, callerPhone),
    getCRMWithFallback(businessId).then((crm) => {
      const normalized = normalizePhoneNumber(callerPhone);
      return normalized ? crm.getCustomer(normalized) : null;
    }),
  ]);

  const context =
    internalContext.status === "fulfilled"
      ? internalContext.value
      : { found: false, normalizedPhone: null, customer: null, pets: [], behaviorLogs: [] };

  const squareCust =
    squareCustomer.status === "fulfilled" ? squareCustomer.value : null;

  if (squareCustomer.status === "rejected") {
    console.error("[lookup-customer] Square lookup failed:", squareCustomer.reason);
  }

  const squareCustomerId = squareCust?.id || context.customer?.squareCustomerId || null;

  // If Square has this customer but we don't have them locally yet, treat as found
  const found = Boolean(context.customer || squareCust);

  // Prefer Square's name if available and internal record not found, otherwise use internal
  const customerName = context.customer?.name || squareCust?.name || null;

  const todayStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: phoneRecord.business.timezone || "America/Los_Angeles",
  });

  // Build the human-readable summary
  let result: string;
  if (!found) {
    result = "No prior customer record found for this caller. Treat them as a new customer and collect full booking details.";
  } else if (!context.customer && squareCust) {
    // Found in Square but not in our internal DB
    result = `Returning customer found in Square CRM. Customer name: ${squareCust.name}. Phone: ${callerPhone}. Greet them by name and collect booking details.`;
  } else {
    result = buildCustomerContextSummary(context);
  }

  return NextResponse.json({
    result,
    found,
    square_customer_id: squareCustomerId,
    customer_name: customerName,
    visit_count: context.customer?.visitCount || squareCust?.visitCount || 0,
    last_service_name: context.customer?.lastServiceName || null,
    last_visit_at: context.customer?.lastVisitAt?.toISOString() || null,
    pets: deduplicatePets(context.pets).map((pet) => ({
      name: pet.name,
      breed: pet.breed,
      size: pet.size,
    })),
    preferred_groomer: (context.customer as { preferredGroomer?: { name: string } | null })?.preferredGroomer?.name || null,
    current_date: todayStr,
  });
}
