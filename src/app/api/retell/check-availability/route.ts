import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { describeAvailableSlots, getAvailableSlots } from "@/lib/calendar";

// Retell custom tool endpoint: called by the voice agent during a call
// to check calendar availability for a given date.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { args, call } = body;

  const date = args?.date;
  const serviceName = args?.service_name;

  // Identify business from the called number
  const calledNumber = call?.to_number;
  const phoneNum = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: { include: { services: true } } },
      })
    : null;

  if (!phoneNum?.business) {
    return NextResponse.json({
      result: "I apologize, but I'm having trouble accessing the system right now. Let me take your information and have someone call you back.",
    });
  }

  const business = phoneNum.business;
  const requestedDate = date || new Date().toISOString().slice(0, 10);
  const timezone = business.timezone || "America/Los_Angeles";

  // Find service duration
  const service = business.services.find(
    (s) =>
      s.isActive &&
      s.name.toLowerCase().includes((serviceName || "").toLowerCase())
  );
  const duration = service?.duration || 60;

  try {
    const slots = await getAvailableSlots(
      business.id,
      requestedDate,
      duration
    );

    if (slots.length === 0) {
      return NextResponse.json({
        result: "I don't have any openings on that day. Would you like to try a different day?",
        available: false,
        available_slots: [],
        timezone,
      });
    }

    const offered = slots.slice(0, 3).map((slot) => ({
      start_time: slot.start.toISOString(),
      end_time: slot.end.toISOString(),
    }));
    const slotDescriptions = describeAvailableSlots(slots, timezone);

    return NextResponse.json({
      result: `I have openings at ${slotDescriptions}. Which time works best for you?`,
      available: true,
      available_slots: offered,
      timezone,
    });
  } catch (error) {
    console.error("Error checking availability:", error);
    return NextResponse.json({
      result: "Let me check with the owner on availability. What day and time would work best for you?",
    });
  }
}
