import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { describeAvailableSlots, getAvailableSlots } from "@/lib/calendar";
import { normalizePhoneNumber } from "@/lib/phone";

const MONTH_MAP: Record<string, number> = {
  january: 1,
  february: 2,
  march: 3,
  april: 4,
  may: 5,
  june: 6,
  july: 7,
  august: 8,
  september: 9,
  october: 10,
  november: 11,
  december: 12,
};

const WEEKDAY_INDEX: Record<string, number> = {
  sunday: 0,
  monday: 1,
  tuesday: 2,
  wednesday: 3,
  thursday: 4,
  friday: 5,
  saturday: 6,
};

function formatDateParts(year: number, month: number, day: number) {
  return `${year.toString().padStart(4, "0")}-${month
    .toString()
    .padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function addDays(ymdDate: string, deltaDays: number) {
  const base = new Date(`${ymdDate}T00:00:00Z`);
  base.setUTCDate(base.getUTCDate() + deltaDays);
  return base.toISOString().slice(0, 10);
}

function getCurrentWeekdayInTimezone(timezone: string) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  })
    .format(new Date())
    .toLowerCase();

  return WEEKDAY_INDEX[weekday];
}

function parseRelativeWeekday(input: string, timezone: string) {
  const weekdayMatch = input.match(
    /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/i
  );
  if (!weekdayMatch) return null;

  const targetWeekday = WEEKDAY_INDEX[weekdayMatch[1].toLowerCase()];
  const currentWeekday = getCurrentWeekdayInTimezone(timezone);
  if (targetWeekday === undefined || currentWeekday === undefined) return null;

  let deltaDays = (targetWeekday - currentWeekday + 7) % 7;
  const lowered = input.toLowerCase();

  if (lowered.includes("next ")) {
    if (deltaDays === 0) deltaDays = 7;
  } else if (!lowered.includes("this ")) {
    if (deltaDays === 0) deltaDays = 7;
  }

  const todayInTz = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
  }).format(new Date());

  return addDays(todayInTz, deltaDays);
}

function formatSpokenDate(ymdDate: string, timezone: string) {
  const [year, month, day] = ymdDate.split("-").map(Number);
  const date = new Date(Date.UTC(year, month - 1, day, 12, 0, 0));

  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(date);
}

function normalizeDateInput(rawDate: unknown, timezone: string) {
  const todayInTz = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
  }).format(new Date());

  if (typeof rawDate !== "string" || !rawDate.trim()) {
    return todayInTz;
  }

  const input = rawDate.trim();
  const relativeWeekday = parseRelativeWeekday(input, timezone);
  if (relativeWeekday) return relativeWeekday;

  const ymd = input.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (ymd) return input;

  const isoPrefix = input.match(/^(\d{4}-\d{2}-\d{2})[T\s]/);
  if (isoPrefix) return isoPrefix[1];

  const monthName = input.match(
    /\b(january|february|march|april|may|june|july|august|september|october|november|december)\b[\s,]+(\d{1,2})(?:st|nd|rd|th)?(?:[\s,]+(\d{4}))?/i
  );
  if (monthName) {
    const month = MONTH_MAP[monthName[1].toLowerCase()];
    const day = Number(monthName[2]);
    const currentYear = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
      }).format(new Date())
    );
    const year = monthName[3] ? Number(monthName[3]) : currentYear;
    if (month && day >= 1 && day <= 31) {
      return formatDateParts(year, month, day);
    }
  }

  const slash = input.match(/\b(\d{1,2})\/(\d{1,2})(?:\/(\d{2,4}))?\b/);
  if (slash) {
    const month = Number(slash[1]);
    const day = Number(slash[2]);
    const currentYear = Number(
      new Intl.DateTimeFormat("en-US", {
        timeZone: timezone,
        year: "numeric",
      }).format(new Date())
    );
    const yearRaw = slash[3];
    const year = yearRaw
      ? yearRaw.length === 2
        ? 2000 + Number(yearRaw)
        : Number(yearRaw)
      : currentYear;
    if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
      return formatDateParts(year, month, day);
    }
  }

  const parsed = new Date(input);
  if (!Number.isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
    }).format(parsed);
  }

  return todayInTz;
}

function normalizePreferredTime(rawTime: unknown) {
  if (typeof rawTime !== "string") return "";
  return rawTime.trim().toLowerCase().replace(/\s+/g, " ");
}

function timeTextToMinutes(rawTime: string) {
  const input = normalizePreferredTime(rawTime);
  if (!input) return null;

  if (input === "noon") return 12 * 60;
  if (input === "midnight") return 0;

  const match = input.match(/^(\d{1,2})(?::(\d{2}))?\s*(am|pm)?$/i);
  if (!match) return null;

  let hour = Number(match[1]);
  const minute = match[2] ? Number(match[2]) : 0;
  const meridiem = match[3]?.toLowerCase();

  if (minute < 0 || minute > 59 || hour < 0 || hour > 23) return null;

  if (meridiem === "am") {
    if (hour === 12) hour = 0;
  } else if (meridiem === "pm") {
    if (hour !== 12) hour += 12;
  }

  if (!meridiem && hour > 23) return null;
  return hour * 60 + minute;
}

function formatSlotTime(date: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
  })
    .format(date)
    .toLowerCase()
    .replace(/\s+/g, " ");
}

function getSlotMinutes(date: Date, timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(
    parts.find((part) => part.type === "minute")?.value || "0"
  );
  return hour * 60 + minute;
}

// Retell custom tool endpoint: called by the voice agent during a call
// to check calendar availability for a given date.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { args, call } = body;

  const date = args?.date;
  const serviceName = args?.service_name;
  const preferredTime = args?.preferred_time;

  // Identify business from the called number (normalize to match DB format)
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
        "I apologize, but I'm having trouble accessing the system right now. Let me take your information and have someone call you back.",
    });
  }

  const business = phoneNum.business;
  const timezone = business.timezone || "America/Los_Angeles";
  const requestedDate = normalizeDateInput(date, timezone);
  const spokenDate = formatSpokenDate(requestedDate, timezone);
  const preferred = normalizePreferredTime(preferredTime);
  const preferredMinutes = preferred ? timeTextToMinutes(preferred) : null;

  // Find service duration
  const service = business.services.find(
    (s) =>
      s.isActive && s.name.toLowerCase().includes((serviceName || "").toLowerCase())
  );
  const duration = service?.duration || 60;

  try {
    const slots = await getAvailableSlots(business.id, requestedDate, duration);

    if (slots.length === 0) {
      return NextResponse.json({
        result: `I don't have any openings on ${spokenDate}. Would you like to try a different day?`,
        available: false,
        available_slots: [],
        timezone,
        normalized_date: requestedDate,
      });
    }

    const offered = slots.slice(0, 3).map((slot) => ({
      start_time: slot.start.toISOString(),
      end_time: slot.end.toISOString(),
      display_time: formatSlotTime(slot.start, timezone),
    }));
    const slotDescriptions = describeAvailableSlots(slots, timezone);
    const preferredSlot =
      preferred.length > 0
        ? slots.find((slot) => {
            if (preferredMinutes !== null) {
              return getSlotMinutes(slot.start, timezone) === preferredMinutes;
            }
            return formatSlotTime(slot.start, timezone) === preferred;
          })
        : undefined;

    if (preferred) {
      if (preferredSlot) {
        return NextResponse.json({
          result: `${preferredTime} is available on ${spokenDate}. Would you like me to book that now?`,
          available: true,
          requested_time_available: true,
          requested_slot: {
            start_time: preferredSlot.start.toISOString(),
            end_time: preferredSlot.end.toISOString(),
            display_time: formatSlotTime(preferredSlot.start, timezone),
          },
          available_slots: offered,
          timezone,
          normalized_date: requestedDate,
        });
      }

      return NextResponse.json({
        result: `${preferredTime} isn't available on ${spokenDate}. I do have openings at ${slotDescriptions}. Which one works best?`,
        available: true,
        requested_time_available: false,
        available_slots: offered,
        timezone,
        normalized_date: requestedDate,
      });
    }

    return NextResponse.json({
      result: `I have openings on ${spokenDate} at ${slotDescriptions}. Which time works best for you?`,
      available: true,
      available_slots: offered,
      timezone,
      normalized_date: requestedDate,
    });
  } catch (error) {
    console.error("Error checking availability:", error);
    return NextResponse.json({
      result:
        "Let me check with the owner on availability. What day and time would work best for you?",
    });
  }
}
