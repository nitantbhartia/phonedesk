import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Service } from "@prisma/client";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { normalizePhoneNumber } from "@/lib/phone";
import { getCRMWithFallback } from "@/crm/withFallback";
import { resolveBusinessFromDemo } from "@/lib/demo-session";
import { matchActiveService } from "@/lib/retell-tool-helpers";

type RetellServicePayload = {
  service_id: string;
  catalog_service_id?: string;
  name: string;
  price: number;
  price_cents: number;
  duration_minutes: number;
  is_addon: boolean;
};

// Retell custom tool: fetches live service names, prices, and durations.
// Called silently after lookup_customer_context, before the agent speaks.
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

  const calledNumber = normalizePhoneNumber(call?.to_number);
  let phoneRecord = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: true },
      })
    : null;

  // Demo number fallback: during onboarding test calls the demo number has no PhoneNumber record
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
    return NextResponse.json({
      result: "Services unavailable.",
      services: [],
    });
  }

  const businessId = phoneRecord.business.id;
  const dbServices = await prisma.service.findMany({
    where: { businessId, isActive: true },
    orderBy: { name: "asc" },
  });

  try {
    const crm = await getCRMWithFallback(businessId);
    const crmServices = await crm.getServices();

    if (crmServices.length > 0) {
      const services = crmServices.flatMap((service) => {
          const crmIdMatch = dbServices.find(
            (s) => s.isActive && s.crmCatalogId && s.crmCatalogId === service.id
          );
          const matchedLocalService = crmIdMatch || matchActiveService(dbServices, service.name);
          if (!matchedLocalService) {
            return [];
          }

          return [{
            service_id: matchedLocalService.id,
            catalog_service_id: service.id,
            name: service.name,
            price: service.priceCents / 100,
            price_cents: service.priceCents,
            duration_minutes: service.durationMinutes,
            is_addon: matchedLocalService.isAddon,
          } satisfies RetellServicePayload];
        });

      if (services.length > 0) {
        const summary = services
          .map((s) => `${s.name} $${s.price} (${s.duration_minutes} min)`)
          .join(", ");

        return NextResponse.json({
          result: `Services loaded: ${summary}`,
          services,
        });
      }
    }
  } catch (err) {
    console.error("[get-services] CRM fetch failed, falling back to DB services:", err);
  }

  const services = dbServices.map((s: Service) => ({
    service_id: s.id,
    name: s.name,
    price: s.price,
    price_cents: Math.round(s.price * 100),
    duration_minutes: s.duration,
    is_addon: s.isAddon,
  })) satisfies RetellServicePayload[];

  const summary = services
    .map((s: { name: string; price: number; duration_minutes: number }) => `${s.name} $${s.price} (${s.duration_minutes} min)`)
    .join(", ");

  return NextResponse.json({
    result: services.length > 0 ? `Services loaded: ${summary}` : "No services configured.",
    services,
  });
}
