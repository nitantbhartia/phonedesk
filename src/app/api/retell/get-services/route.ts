import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { normalizePhoneNumber } from "@/lib/phone";
import { getCRMWithFallback } from "@/crm/withFallback";

// Retell custom tool: fetches live service names, prices, and durations.
// Called silently after lookup_customer_context, before the agent speaks.
export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-retell-signature") || "";

  if (!isRetellWebhookValid(rawBody, signature, req.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const { call } = body;

  const calledNumber = normalizePhoneNumber(call?.to_number);
  const phoneRecord = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: true },
      })
    : null;

  if (!phoneRecord?.business) {
    return NextResponse.json({
      result: "Services unavailable.",
      services: [],
    });
  }

  const businessId = phoneRecord.business.id;

  try {
    const crm = await getCRMWithFallback(businessId);
    const crmServices = await crm.getServices();

    if (crmServices.length > 0) {
      const services = crmServices.map((s) => ({
        name: s.name,
        price: s.priceCents / 100,
        price_cents: s.priceCents,
        duration_minutes: s.durationMinutes,
      }));

      const summary = services
        .map((s) => `${s.name} $${s.price} (${s.duration_minutes} min)`)
        .join(", ");

      return NextResponse.json({
        result: `Services loaded: ${summary}`,
        services,
      });
    }
  } catch (err) {
    console.error("[get-services] CRM fetch failed, falling back to DB services:", err);
  }

  // Final fallback: use services from the business DB record
  const dbServices = await prisma.service.findMany({
    where: { businessId, isActive: true },
    orderBy: { name: "asc" },
  });

  const services = dbServices.map((s) => ({
    name: s.name,
    price: s.price,
    price_cents: Math.round(s.price * 100),
    duration_minutes: s.duration,
  }));

  const summary = services
    .map((s) => `${s.name} $${s.price} (${s.duration_minutes} min)`)
    .join(", ");

  return NextResponse.json({
    result: services.length > 0 ? `Services loaded: ${summary}` : "No services configured.",
    services,
  });
}
