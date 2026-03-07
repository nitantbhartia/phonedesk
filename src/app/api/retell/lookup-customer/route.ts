import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  buildCustomerContextSummary,
  deduplicatePets,
  lookupCustomerContext,
} from "@/lib/customer-memory";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { normalizePhoneNumber } from "@/lib/phone";

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
    });
  }

  const context = await lookupCustomerContext(
    phoneRecord.business.id,
    args?.caller_phone || call?.from_number
  );

  const todayStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: phoneRecord.business.timezone || "America/Los_Angeles",
  });

  return NextResponse.json({
    result: buildCustomerContextSummary(context),
    found: context.found,
    customer_name: context.customer?.name || null,
    visit_count: context.customer?.visitCount || 0,
    last_service_name: context.customer?.lastServiceName || null,
    last_visit_at: context.customer?.lastVisitAt?.toISOString() || null,
    pets: deduplicatePets(context.pets).map((pet) => ({
      name: pet.name,
      breed: pet.breed,
      size: pet.size,
      notes: pet.notes,
    })),
    current_date: todayStr,
  });
}
