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

/**
 * Parse a date string from the AI model into YYYY-MM-DD in the business timezone.
 *
 * All date math happens in the business timezone to avoid off-by-one errors
 * when the server is UTC and the business is in a US timezone.
 */
function resolveDate(input: string, timezone: string): string {
  const now = new Date();

  // Get today's date/day-of-week in the BUSINESS timezone (not server timezone)
  const bizDateStr = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(now);
  const [bizYear, bizMonth, bizDay] = bizDateStr.split("-").map(Number);
  const bizDow = new Date(Date.UTC(bizYear, bizMonth - 1, bizDay, 12)).getUTCDay();

  // Helper: given year/month/day, return YYYY-MM-DD (handles month overflow)
  const ymd = (y: number, m: number, d: number) => {
    const dt = new Date(Date.UTC(y, m - 1, d, 12));
    return dt.toISOString().slice(0, 10);
  };

  const lower = input.trim().toLowerCase();

  if (lower === "today" || lower === "now") {
    return bizDateStr;
  }
  if (lower === "tomorrow") {
    return ymd(bizYear, bizMonth, bizDay + 1);
  }

  // "next monday", "this friday", etc.
  const dayNames = [
    "sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday",
  ];
  const nextMatch = lower.match(/^(?:next|this)\s+(\w+)$/);
  if (nextMatch) {
    const targetDay = dayNames.indexOf(nextMatch[1]);
    if (targetDay !== -1) {
      let daysAhead = targetDay - bizDow;
      if (daysAhead <= 0) daysAhead += 7;
      return ymd(bizYear, bizMonth, bizDay + daysAhead);
    }
  }

  // Bare day name: "monday", "friday"
  const bareDay = dayNames.indexOf(lower);
  if (bareDay !== -1) {
    let daysAhead = bareDay - bizDow;
    if (daysAhead <= 0) daysAhead += 7;
    return ymd(bizYear, bizMonth, bizDay + daysAhead);
  }

  // Already YYYY-MM-DD or YYYY-MM-DDTHH:MM:SS — strip any time part
  const isoMatch = input.trim().match(/^(\d{4}-\d{2}-\d{2})(?:T.*)?$/);
  if (isoMatch) {
    return isoMatch[1];
  }

  // Strip leading day-name prefix that AI models often add
  // e.g., "Monday, March 9" → "March 9", "Tuesday March 10, 2026" → "March 10, 2026"
  const stripped = input.trim().replace(/^(?:mon|tue|wed|thu|fri|sat|sun)\w*[,]?\s+/i, "");

  // Try parsing (handles "March 9, 2026", "3/10/2026", etc.)
  // Use UTC components to avoid timezone day-shift
  const tryParse = (s: string): string | null => {
    const d = new Date(s);
    if (isNaN(d.getTime())) return null;
    const y = d.getUTCFullYear();
    const m = String(d.getUTCMonth() + 1).padStart(2, "0");
    const day = String(d.getUTCDate()).padStart(2, "0");
    let result = `${y}-${m}-${day}`;
    // Fix wrong year from year-less strings (e.g., "March 9" → 2001)
    if (result < bizDateStr) {
      result = `${bizYear}-${m}-${day}`;
      if (result < bizDateStr) {
        result = `${bizYear + 1}-${m}-${day}`;
      }
    }
    return result;
  };

  const fromStripped = tryParse(stripped);
  if (fromStripped) return fromStripped;

  // Try appending current year for year-less strings like "March 9"
  const fromWithYear = tryParse(`${stripped}, ${bizYear}`);
  if (fromWithYear) return fromWithYear;

  // Try the original input in case stripping removed something needed
  const fromOriginal = tryParse(input);
  if (fromOriginal) return fromOriginal;

  // Give up — return today
  console.warn(`[check-availability] Could not parse date "${input}", defaulting to today`);
  return bizDateStr;
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
      timeZone: timezone,
    });

    if (slots.length === 0) {
      const businessHours = business.businessHours as BusinessHoursMap | null;
      const isClosed = !isBusinessOpenOnDate(requestedDate, businessHours);

      // Look ahead up to 7 days to find the next day with openings,
      // including its actual slots so the agent can offer them immediately
      let nextAvailableDay: string | null = null;
      let nextAvailableSlots: Awaited<ReturnType<typeof getAvailableSlots>> = [];
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
          nextAvailableSlots = probeSlots;
          break;
        }
      }

      const requestedDayName = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        timeZone: timezone,
      }).format(new Date(ry, rm - 1, rd));

      const checkedDateLabel = new Intl.DateTimeFormat("en-US", {
        weekday: "long",
        month: "long",
        day: "numeric",
        timeZone: timezone,
      }).format(new Date(ry, rm - 1, rd));

      let message: string;
      if (isClosed) {
        const hoursStr = businessHours ? formatBusinessHoursForAgent(businessHours) : "";
        message = `We're closed on ${requestedDayName}s.${hoursStr ? ` Our hours are ${hoursStr}.` : ""}`;
      } else {
        message = `We're fully booked on ${requestedDayName}.`;
      }

      // Include next-day slots inline so the agent can offer them without another tool call
      if (nextAvailableDay && nextAvailableSlots.length > 0) {
        const nextSlotDescriptions = describeAvailableSlots(nextAvailableSlots, timezone);
        message += ` The next available day is ${nextAvailableDay} with openings at ${nextSlotDescriptions}. Would any of those times work?`;
      } else if (nextAvailableDay) {
        message += ` The next available day is ${nextAvailableDay}. Would you like me to check that day?`;
      } else {
        message += ` Would you like to try a different day?`;
      }

      return NextResponse.json({
        result: message,
        available: false,
        available_slots: [],
        checked_date: requestedDate,
        checked_date_label: checkedDateLabel,
        timezone,
        current_date: todayStr,
        next_available_day: nextAvailableDay,
        next_available_slots: nextAvailableSlots.slice(0, 3).map((slot) => ({
          start_time: slot.start.toISOString(),
          end_time: slot.end.toISOString(),
        })),
      });
    }

    const offered = slots.slice(0, 3).map((slot) => ({
      start_time: slot.start.toISOString(),
      end_time: slot.end.toISOString(),
    }));
    const slotDescriptions = describeAvailableSlots(slots, timezone);

    // Include explicit date name so the agent relays it accurately
    const [ry2, rm2, rd2] = requestedDate.split("-").map(Number);
    const requestedDateLabel = new Intl.DateTimeFormat("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      timeZone: timezone,
    }).format(new Date(ry2, rm2 - 1, rd2));

    return NextResponse.json({
      result: `I have openings on ${requestedDateLabel} at ${slotDescriptions}. Which time works best for you?`,
      available: true,
      available_slots: offered,
      checked_date: requestedDate,
      checked_date_label: requestedDateLabel,
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
