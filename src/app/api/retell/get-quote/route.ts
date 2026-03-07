import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { normalizePhoneNumber } from "@/lib/phone";

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-retell-signature") || "";

  if (!isRetellWebhookValid(rawBody, signature)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = JSON.parse(rawBody);
  const { args, call } = body;
  const serviceName = String(args?.service_name || "").trim();

  const calledNumber = normalizePhoneNumber(call?.to_number);
  const phoneNum = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: { include: { services: true } } },
      })
    : null;

  if (!phoneNum?.business) {
    return NextResponse.json({
      result:
        "I'm having trouble pulling up pricing right now. I can have the owner text you exact pricing right after this call.",
      found: false,
    });
  }

  const activeServices = phoneNum.business.services.filter((s) => s.isActive);
  const matchedService = serviceName
    ? activeServices.find((service) =>
        service.name.toLowerCase().includes(serviceName.toLowerCase())
      )
    : null;

  if (!matchedService) {
    const serviceList = activeServices
      .slice(0, 4)
      .map((service) => `${service.name} ($${service.price})`)
      .join(", ");
    return NextResponse.json({
      result: serviceList
        ? `I can quote ${serviceList}. Which service are you interested in?`
        : "I don't have service pricing configured yet. The owner can text you exact pricing right away.",
      found: false,
    });
  }

  return NextResponse.json({
    result: `${matchedService.name} is $${matchedService.price} and usually takes about ${matchedService.duration} minutes. Want me to check availability for that service?`,
    found: true,
    service_name: matchedService.name,
    price: matchedService.price,
    duration_minutes: matchedService.duration,
  });
}
