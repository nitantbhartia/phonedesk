import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { describeAvailableSlots, getAvailableSlots } from "@/lib/calendar";

type BusinessHoursMap = Record<string, { open: string; close: string }>;

function getHoursForDay(
  hours: BusinessHoursMap,
  dayKey: string
): { open: string; close: string } | undefined {
  if (hours[dayKey]) return hours[dayKey];

  const fullDayNames: Record<string, string> = {
    sat: "saturday", sun: "sunday", mon: "monday", tue: "tuesday",
    wed: "wednesday", thu: "thursday", fri: "friday",
  };
  if (fullDayNames[dayKey] && hours[fullDayNames[dayKey]]) {
    return hours[fullDayNames[dayKey]];
  }

  if (["mon", "tue", "wed", "thu", "fri"].includes(dayKey) && hours["mon-fri"]) {
    return hours["mon-fri"];
  }

  return undefined;
}

function isBusinessOpenOnDate(
  dateStr: string,
  hours: BusinessHoursMap | null
): boolean {
  if (!hours || Object.keys(hours).length === 0) return true; // default open
  const [y, m, d] = dateStr.split("-").map(Number);
  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const dayKey = dayNames[new Date(y, m - 1, d).getDay()];
  const dayHours = getHoursForDay(hours, dayKey);
  return !!(dayHours?.open && dayHours?.close);
}

function formatBusinessHoursForAgent(hours: BusinessHoursMap): string {
  const dayLabels: Record<string, string> = {
    "mon-fri": "Mon–Fri", mon: "Mon", tue: "Tue", wed: "Wed",
    thu: "Thu", fri: "Fri", sat: "Sat", sun: "Sun",
    monday: "Mon", tuesday: "Tue", wednesday: "Wed",
    thursday: "Thu", friday: "Fri", saturday: "Sat", sunday: "Sun",
  };
  return Object.entries(hours)
    .filter(([, v]) => v?.open && v?.close)
    .map(([day, { open, close }]) => `${dayLabels[day] || day}: ${open}–${close}`)
    .join(", ");
}

// Resolve natural language or partial date strings to YYYY-MM-DD
function resolveDate(input: string, timezone: string): string {
  const today = new Date();
  const fmt = (d: Date) =>
    new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(d);

  const lower = input.trim().toLowerCase();

  if (lower === "today" || lower === "now") {
    return fmt(today);
  }
  if (lower === "tomorrow") {
    const d = new Date(today);
    d.setDate(d.getDate() + 1);
    return fmt(d);
  }

  // "next monday", "this friday", etc.
  const dayNames = [
    "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
  ];
  const nextMatch = lower.match(/^(?:next|this)\s+(\w+)$/);
  if (nextMatch) {
    const targetDay = dayNames.indexOf(nextMatch[1]);
    if (targetDay !== -1) {
      const d = new Date(today);
      const currentDay = d.getDay();
      let daysAhead = targetDay - currentDay;
      if (daysAhead <= 0) daysAhead += 7;
      d.setDate(d.getDate() + daysAhead);
      return fmt(d);
    }
  }

  // Bare day name: "monday", "friday"
  const bareDay = dayNames.indexOf(lower);
  if (bareDay !== -1) {
    const d = new Date(today);
    const currentDay = d.getDay();
    let daysAhead = bareDay - currentDay;
    if (daysAhead <= 0) daysAhead += 7;
    d.setDate(d.getDate() + daysAhead);
    return fmt(d);
  }

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(input.trim())) {
    return input.trim();
  }

  // Try native Date parsing as last resort (e.g., "March 10", "3/10/2026")
  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) {
    return fmt(parsed);
  }

  // Give up — return today
  console.warn(`[check-availability] Could not parse date "${input}", defaulting to today`);
  return fmt(today);
}

// Retell custom tool endpoint: called by the voice agent during a call
// to check calendar availability for a given date.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { args, call } = body;

  const date = args?.date;
  const serviceName = args?.service_name;

  console.log("[check-availability] args:", JSON.stringify(args), "from:", call?.from_number, "to:", call?.to_number);

  // Identify business from the called number
  const calledNumber = call?.to_number;
  const phoneNum = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: { include: { services: true } } },
      })
    : null;

  if (!phoneNum?.business) {
    console.error("[check-availability] No business found for calledNumber:", calledNumber);
    return NextResponse.json({
      result: "I apologize, but I'm having trouble accessing the scheduling system right now. Can you hold on a moment while I try again?",
    });
  }

  const business = phoneNum.business;
  const timezone = business.timezone || "America/Los_Angeles";
  let requestedDate = date
    ? resolveDate(date, timezone)
    : new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());

  console.log("[check-availability] resolved date:", requestedDate, "timezone:", timezone, "service:", serviceName);

  // Auto-correct past dates: the AI model sometimes hallucinates old years
  // (e.g. 2024-05-21 instead of 2026-05-21). Fix the year automatically.
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  if (requestedDate < todayStr) {
    const [, mm, dd] = requestedDate.split("-");
    const [currentYear] = todayStr.split("-");
    let corrected = `${currentYear}-${mm}-${dd}`;
    // If month/day is still in the past this year, use next year
    if (corrected < todayStr) {
      corrected = `${Number(currentYear) + 1}-${mm}-${dd}`;
    }
    console.warn("[check-availability] Auto-corrected past date:", requestedDate, "→", corrected);
    requestedDate = corrected;
  }

  // Find service duration
  const service = serviceName
    ? business.services.find(
        (s) =>
          s.isActive &&
          s.name.toLowerCase().includes(serviceName.toLowerCase())
      )
    : null;
  const duration = service?.duration || 60;

  try {
    const slots = await getAvailableSlots(
      business.id,
      requestedDate,
      duration
    );

    console.log("[check-availability] found", slots.length, "slots for", requestedDate);

    const todayStr = new Date().toLocaleDateString("en-US", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    if (slots.length === 0) {
      const businessHours = business.businessHours as BusinessHoursMap | null;
      const isClosed = !isBusinessOpenOnDate(requestedDate, businessHours);

      // Look ahead up to 7 days to find the next day with openings
      let nextAvailableDay: string | null = null;
      const [ry, rm, rd] = requestedDate.split("-").map(Number);
      for (let i = 1; i <= 7; i++) {
        const probe = new Date(ry, rm - 1, rd + i);
        const probeStr = probe.toISOString().slice(0, 10);
        if (!isBusinessOpenOnDate(probeStr, businessHours)) continue;
        const probeSlots = await getAvailableSlots(business.id, probeStr, duration);
        if (probeSlots.length > 0) {
          nextAvailableDay = new Intl.DateTimeFormat("en-US", {
            weekday: "long",
            month: "long",
            day: "numeric",
            timeZone: timezone,
          }).format(probe);
          break;
        }
      }

      const requestedDayName = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        timeZone: timezone,
      }).format(new Date(ry, rm - 1, rd));

      let message: string;
      if (isClosed) {
        const hoursStr = businessHours ? formatBusinessHoursForAgent(businessHours) : "";
        message = `We're closed on ${requestedDayName}s.${hoursStr ? ` Our hours are ${hoursStr}.` : ""}`;
      } else {
        message = `We're fully booked on ${requestedDayName}.`;
      }

      if (nextAvailableDay) {
        message += ` The next available day is ${nextAvailableDay}. Would you like me to check that day?`;
      } else {
        message += ` Would you like to try a different day?`;
      }

      return NextResponse.json({
        result: message,
        available: false,
        available_slots: [],
        timezone,
        current_date: todayStr,
        next_available_day: nextAvailableDay,
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
      current_date: todayStr,
    });
  } catch (error) {
    console.error("[check-availability] Error:", error);
    return NextResponse.json({
      result: "I'm having a little trouble pulling up the schedule right now. What day and time were you thinking? I'll try again.",
    });
  }
}
