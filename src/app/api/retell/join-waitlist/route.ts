import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  parseRetellDateInput,
  parseRetellRequest,
  resolveRetellBusiness,
} from "@/lib/retell-tool-helpers";
import { normalizePhoneNumber } from "@/lib/phone";

const VALID_SIZES = new Set(["SMALL", "MEDIUM", "LARGE", "XLARGE"]);

export async function POST(req: NextRequest) {
  const parsed = await parseRetellRequest(req);
  if (parsed instanceof NextResponse) {
    return parsed;
  }

  const { args, call } = parsed;
  const business = await resolveRetellBusiness(call.to_number);
  if (!business) {
    return NextResponse.json({
      result:
        "I wasn't able to reach the waitlist right now. Please call back and we'll get you added.",
      waitlisted: false,
    });
  }

  const customerName = args.customer_name?.trim();
  const customerPhone = normalizePhoneNumber(
    args.customer_phone?.trim() || call.from_number
  );
  const preferredDateRaw = args.preferred_date?.trim();
  const preferredTime = args.preferred_time?.trim();
  const petSize =
    args.pet_size && VALID_SIZES.has(args.pet_size.toUpperCase())
      ? args.pet_size.toUpperCase()
      : null;

  if (!customerName || !preferredDateRaw) {
    return NextResponse.json({
      result:
        "I still need the customer's name and preferred day before I can add them to the waitlist.",
      waitlisted: false,
    });
  }

  if (!customerPhone) {
    return NextResponse.json({
      result:
        "I still need a callback number before I can add them to the waitlist.",
      waitlisted: false,
    });
  }

  const preferredDate = parseRetellDateInput(
    preferredDateRaw,
    business.timezone || "America/Los_Angeles"
  );
  if (!preferredDate) {
    return NextResponse.json({
      result:
        "That preferred date didn't come through clearly. Could you repeat which day they want?",
      waitlisted: false,
    });
  }

  const entry = await prisma.waitlistEntry.create({
    data: {
      businessId: business.id,
      customerName,
      customerPhone,
      petName: args.pet_name?.trim() || null,
      petBreed: args.pet_breed?.trim() || null,
      petSize: petSize as "SMALL" | "MEDIUM" | "LARGE" | "XLARGE" | null,
      serviceName: args.service_name?.trim() || null,
      preferredDate,
      preferredTime: preferredTime || null,
      notes: args.notes?.trim() || null,
    },
  });

  return NextResponse.json({
    waitlisted: true,
    entry_id: entry.id,
    result: `Perfect — ${customerName} is on the waitlist for ${args.pet_name?.trim() || "that visit"}. We'll text them if an opening comes up${preferredTime ? ` around ${preferredTime}` : ""}.`,
  });
}
