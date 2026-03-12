import { NextRequest, NextResponse } from "next/server";
import {
  formatBusinessHours,
  getBusinessOpenState,
  parseRetellRequest,
  resolveRetellBusiness,
} from "@/lib/retell-tool-helpers";
import { normalizePhoneNumber } from "@/lib/phone";

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
        "I'm having trouble pulling that information up right now. I can have the owner follow up with the details.",
      answerable: false,
    });
  }

  const question = args.question?.trim();
  if (!question) {
    return NextResponse.json({
      result:
        "Tell me what the caller is asking, and I'll look up the business details.",
      answerable: false,
    });
  }

  const lower = question.toLowerCase();
  const calledNumber = normalizePhoneNumber(call.to_number);
  const hours = formatBusinessHours(business.businessHours);
  const timezone = business.timezone || "America/Los_Angeles";
  const openState = getBusinessOpenState(business.businessHours, timezone);
  const location = [business.address, business.city, business.state]
    .filter(Boolean)
    .join(", ");

  if (/(hours|open|close|closing|opening|when are you)/.test(lower)) {
    const hoursLead = openState
      ? openState.hasHoursToday
        ? `${business.name} is ${openState.isOpenNow ? "open" : "closed"} right now.`
        : `${business.name} is closed today.`
      : `${business.name}'s hours are listed as follows.`;

    return NextResponse.json({
      topic: "hours",
      answerable: Boolean(hours),
      result: hours
        ? `${hoursLead} Our hours are ${hours}.`
        : `I don't have custom business hours on file for ${business.name}, so I'll have ${business.ownerName} confirm the exact hours for you.`,
    });
  }

  if (/(where|address|located|location|directions)/.test(lower)) {
    return NextResponse.json({
      topic: "location",
      answerable: Boolean(location),
      result: location
        ? `${business.name} is located at ${location}.`
        : `I don't have the full address on file right now, so I'll have ${business.ownerName} send that over.`,
    });
  }

  if (
    /(first visit|first time|new client|new customer|intake|paperwork|form|what should i bring|what do i bring)/.test(
      lower
    )
  ) {
    return NextResponse.json({
      topic: "first_visit",
      answerable: true,
      result:
        `For a first visit, we usually send a quick intake form before the appointment. It's also best to arrive a few minutes early so ${business.ownerName}'s team can get everything on file.`,
    });
  }

  if (/(cancel|cancellation|resched|reschedule|late|refund|deposit|policy|fee)/.test(lower)) {
    return NextResponse.json({
      topic: "policy",
      answerable: false,
      result:
        `I don't have a custom policy on file for that. The safest thing is to have ${business.ownerName} confirm the exact policy details directly.`,
    });
  }

  if (/(phone|number|call back|contact|reach you)/.test(lower)) {
    const contactNumber = normalizePhoneNumber(business.phone) || calledNumber;
    return NextResponse.json({
      topic: "contact",
      answerable: Boolean(contactNumber),
      result: contactNumber
        ? `The best number for ${business.name} is ${contactNumber}.`
        : `I don't have a direct callback number on file, so I'll have ${business.ownerName} follow up with the right contact number.`,
    });
  }

  if (/(price|pricing|cost|quote)/.test(lower)) {
    return NextResponse.json({
      topic: "pricing",
      answerable: false,
      result:
        "For exact pricing, use the live service list instead of guessing. I can help with that if the caller tells us which service they mean.",
    });
  }

  return NextResponse.json({
    topic: "general",
    answerable: false,
    result:
      `I don't have a reliable answer for that on file, so I'll have ${business.ownerName} follow up directly with the details.`,
  });
}
