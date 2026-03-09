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
  const rawBody = await getRawBody(req);
  const signature = getHeader(req, "x-retell-signature");

  if (!isRetellWebhookValid(rawBody, signature, getHeaders(req))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { args?: { caller_phone?: string }; call?: { to_number?: string; from_number?: string } };
  try {
    body = JSON.parse(rawBody || "{}");
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

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

  // --- Subscription gate ---
  // Allow calls during onboarding test (onboardingComplete = false).
  // Once onboarding is done, require an active subscription to take calls.
  // stripeSubscriptionStatus='active' is the authoritative check and overrides
  // isActive so that existing subscribers who didn't go through the post-deploy
  // goLive path are never accidentally blocked.
  const biz = phoneRecord.business;
  const hasActiveSub = biz.stripeSubscriptionStatus === "active";
  if (biz.onboardingComplete && !biz.isActive && !hasActiveSub) {
    return NextResponse.json({
      result: `This line is temporarily inactive. Please apologize warmly and tell the caller to reach ${biz.ownerName} directly at the business phone number. Then call end_call immediately.`,
      found: false,
      square_customer_id: null,
      subscription_inactive: true,
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

function getHeaders(req: Request): Headers | undefined {
  const headers = (req as { headers?: unknown }).headers;
  return headers instanceof Headers ? headers : undefined;
}

function getHeader(req: Request, key: string): string {
  const headers = (req as { headers?: unknown }).headers;

  if (headers instanceof Headers) {
    return headers.get(key) || "";
  }

  if (headers && typeof headers === "object") {
    const record = headers as Record<string, string | undefined>;
    return record[key] || record[key.toLowerCase()] || "";
  }

  return "";
}

async function getRawBody(req: Request): Promise<string> {
  const requestWithText = req as Request & { text?: () => Promise<string> };
  if (typeof requestWithText.text === "function") {
    return requestWithText.text();
  }

  const requestWithJson = req as Request & { json?: () => Promise<unknown> };
  if (typeof requestWithJson.json === "function") {
    const payload = await requestWithJson.json();
    return JSON.stringify(payload ?? {});
  }

  return "";
}
