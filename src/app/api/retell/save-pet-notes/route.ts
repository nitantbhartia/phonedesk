import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { normalizePhoneNumber } from "@/lib/phone";
import { resolveBusinessFromDemo } from "@/lib/demo-session";

// Retell custom tool endpoint: saves grooming style notes and/or behavior flags for a pet.
// Called silently (no_speak) after a booking or when the caller mentions preferences.
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
  const {
    pet_name: petName,
    grooming_notes: groomingNotes,
    behavior_note: behaviorNote,
    behavior_tags: behaviorTagsRaw,
    behavior_severity: behaviorSeverityRaw,
  } = args || {};

  if (!petName) {
    return NextResponse.json({ result: "Pet name is required.", saved: false });
  }

  // Identify business
  const calledNumber = normalizePhoneNumber(call?.to_number);
  let phoneRecord = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: { include: { phoneNumber: true } } },
      })
    : null;

  if (!phoneRecord && calledNumber) {
    const demoBusinessId = await resolveBusinessFromDemo(calledNumber);
    if (demoBusinessId) {
      const demoBusiness = await prisma.business.findUnique({
        where: { id: demoBusinessId },
        include: { phoneNumber: true },
      });
      if (demoBusiness) {
        phoneRecord = { businessId: demoBusinessId, business: demoBusiness } as unknown as typeof phoneRecord;
      }
    }
  }

  if (!phoneRecord?.business) {
    return NextResponse.json({ result: "Business not found.", saved: false });
  }

  const business = phoneRecord.business;
  const callerPhone = normalizePhoneNumber(call?.from_number);

  if (!callerPhone) {
    return NextResponse.json({
      result: "Caller phone is required to save pet notes.",
      saved: false,
    });
  }

  // Find or create the customer record
  const customer = await prisma.customer.findUnique({
    where: { businessId_phone: { businessId: business.id, phone: callerPhone } },
  });

  if (!customer) {
    return NextResponse.json({
      result: "No customer record found for this caller — notes will be saved on the next booking.",
      saved: false,
    });
  }

  // Upsert the pet, updating grooming notes if provided
  const pet = await prisma.pet.upsert({
    where: { customerId_name: { customerId: customer.id, name: petName } },
    create: {
      customerId: customer.id,
      name: petName,
      notes: groomingNotes || undefined,
    },
    update: {
      ...(groomingNotes ? { notes: groomingNotes } : {}),
    },
  });

  // Save behavior log if a behavior note was provided
  if (behaviorNote) {
    const validSeverities = ["NOTE", "CAUTION", "HIGH_RISK"] as const;
    type Severity = (typeof validSeverities)[number];
    const severity: Severity =
      behaviorSeverityRaw && validSeverities.includes(behaviorSeverityRaw.toUpperCase() as Severity)
        ? (behaviorSeverityRaw.toUpperCase() as Severity)
        : "NOTE";

    const tags = behaviorTagsRaw
      ? behaviorTagsRaw.split(",").map((t) => t.trim().toLowerCase()).filter(Boolean)
      : [];

    await prisma.behaviorLog.create({
      data: {
        businessId: business.id,
        customerId: customer.id,
        petId: pet.id,
        petName,
        severity,
        note: behaviorNote,
        tags,
      },
    });
  }

  const saved = Boolean(groomingNotes || behaviorNote);
  return NextResponse.json({
    result: saved ? "Got it — notes saved for next time." : "Nothing to save.",
    saved,
  });
}
