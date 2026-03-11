import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import { parseJsonBody, requireCurrentBusiness } from "@/lib/route-helpers";

const validWaitlistStatuses = new Set([
  "WAITING",
  "NOTIFIED",
  "BOOKED",
  "EXPIRED",
  "DECLINED",
]);

const waitlistSchema = z.object({
  customerName: z.string().trim().min(1, "customerName is required").max(120),
  customerPhone: z.string().trim().min(1, "customerPhone is required"),
  petName: z.string().trim().max(120).optional().or(z.literal("")),
  petBreed: z.string().trim().max(120).optional().or(z.literal("")),
  petSize: z.enum(["SMALL", "MEDIUM", "LARGE", "XLARGE"]).optional().nullable(),
  serviceName: z.string().trim().max(120).optional().or(z.literal("")),
  preferredDate: z.string().trim().min(1, "preferredDate is required"),
  preferredTime: z.string().trim().max(100).optional().or(z.literal("")),
  notes: z.string().trim().max(500).optional().or(z.literal("")),
});

// GET: List waitlist entries for the business
export async function GET(req: NextRequest) {
  const businessResult = await requireCurrentBusiness();
  if ("response" in businessResult) {
    return businessResult.response;
  }
  const { business } = businessResult;

  const status = req.nextUrl.searchParams.get("status") || "WAITING";
  if (!validWaitlistStatuses.has(status)) {
    return NextResponse.json({ error: "Invalid status" }, { status: 400 });
  }

  const entries = await prisma.waitlistEntry.findMany({
    where: {
      businessId: business.id,
      status: status as "WAITING" | "NOTIFIED" | "BOOKED" | "EXPIRED" | "DECLINED",
    },
    orderBy: { preferredDate: "asc" },
  });

  return NextResponse.json({ entries });
}

// POST: Add to waitlist (can be called by voice agent or dashboard)
export async function POST(req: NextRequest) {
  const businessResult = await requireCurrentBusiness();
  if ("response" in businessResult) {
    return businessResult.response;
  }
  const { business } = businessResult;

  const bodyResult = await parseJsonBody(req, waitlistSchema);
  if ("response" in bodyResult) {
    return bodyResult.response;
  }
  const {
    customerName,
    customerPhone,
    petName,
    petBreed,
    petSize,
    serviceName,
    preferredDate,
    preferredTime,
    notes,
  } = bodyResult.data;

  const normalizedPhone = normalizePhoneNumber(customerPhone);
  if (!normalizedPhone) {
    return NextResponse.json(
      { error: "customerPhone must be a valid phone number" },
      { status: 400 }
    );
  }

  const parsedDate = new Date(preferredDate);
  if (Number.isNaN(parsedDate.getTime())) {
    return NextResponse.json(
      { error: "preferredDate must be a valid date" },
      { status: 400 }
    );
  }

  const parsedDate = new Date(preferredDate);
  if (isNaN(parsedDate.getTime())) {
    return NextResponse.json({ error: "preferredDate is not a valid date" }, { status: 400 });
  }

  const entry = await prisma.waitlistEntry.create({
    data: {
      businessId: business.id,
      customerName,
      customerPhone: normalizedPhone,
      petName: petName || null,
      petBreed: petBreed || null,
      petSize: petSize || null,
      serviceName: serviceName || null,
      preferredDate: parsedDate,
      preferredTime: preferredTime || null,
      notes: notes || null,
    },
  });

  return NextResponse.json({ entry }, { status: 201 });
}

// DELETE: Remove from waitlist
export async function DELETE(req: NextRequest) {
  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const businessResult = await requireCurrentBusiness();
  if ("response" in businessResult) {
    return businessResult.response;
  }
  const { business } = businessResult;

  await prisma.waitlistEntry.deleteMany({
    where: { id, businessId: business.id },
  });

  return NextResponse.json({ success: true });
}
