import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import type { Service } from "@prisma/client";
import { describeAvailableSlots, getAvailableSlots } from "@/lib/calendar";
import { normalizePhoneNumber } from "@/lib/phone";
import { resolveBusinessFromDemo } from "@/lib/demo-session";
import { isRetellWebhookValid } from "@/lib/retell-auth";

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

  // "next Monday" always means 7 days out even if today is Monday.
  // Bare "Monday" on Monday means today — don't push it to next week.
  if (lowered.includes("next ")) {
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

const NEXT_AVAILABLE_SENTINEL = "next_available";

/**
 * Convert a local hour (e.g. 10 for 10am) on a specific date string (YYYY-MM-DD)
 * into a UTC Date, accounting for the timezone offset on that day.
 */
function localHourToUtc(dateStr: string, hour: number, timezone: string): Date {
  // Approximate: assume the hour in UTC, then measure the actual local hour
  const approx = new Date(
    `${dateStr}T${hour.toString().padStart(2, "0")}:00:00Z`
  );
  const actualLocalHour = Number(
    new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour: "2-digit",
      hour12: false,
    })
      .formatToParts(approx)
      .find((p) => p.type === "hour")?.value ?? hour
  );
  // Shift by the difference to land on the correct local hour
  return new Date(approx.getTime() + (hour - actualLocalHour) * 3_600_000);
}

/**
 * Find the next Monday–Friday date at or after startDate (YYYY-MM-DD).
 */
function nextWeekday(startDate: string, timezone: string): string {
  let candidate = startDate;
  for (let i = 0; i < 7; i++) {
    const probe = new Date(candidate + "T12:00:00Z");
    const weekday = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "long",
    })
      .format(probe)
      .toLowerCase();
    if (weekday !== "saturday" && weekday !== "sunday") return candidate;
    candidate = addDays(candidate, 1);
  }
  return candidate; // fallback: should never reach here
}

/**
 * Build guaranteed demo slots (10am, 11am, 2pm) on a given date.
 * Used when the 14-day scan finds nothing, so the booking demo always works.
 */
function buildFallbackSlots(
  dateStr: string,
  timezone: string,
  durationMins: number
) {
  return [10, 11, 14].map((hour) => {
    const start = localHourToUtc(dateStr, hour, timezone);
    const end = new Date(start.getTime() + durationMins * 60_000);
    return { start, end };
  });
}

function normalizeDateInput(rawDate: unknown, timezone: string) {
  const todayInTz = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
  }).format(new Date());

  if (typeof rawDate !== "string" || !rawDate.trim()) {
    return todayInTz;
  }

  const input = rawDate.trim();

  // Handle "today" and "tomorrow" before anything else
  if (/\btoday\b/i.test(input)) return todayInTz;
  if (/\btomorrow\b/i.test(input)) return addDays(todayInTz, 1);

  // Detect "first available", "next available", "as soon as possible", etc.
  if (
    /\b(first|next|earliest|soonest|any|asap|as soon as possible|whenever|open)\b/i.test(
      input
    ) &&
    !/\b(monday|tuesday|wednesday|thursday|friday|saturday|sunday)\b/i.test(
      input
    )
  ) {
    return NEXT_AVAILABLE_SENTINEL;
  }

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
  } else {
    // No meridiem — grooming businesses are never open 1am–7am, so treat those as PM
    if (hour >= 1 && hour <= 7) hour += 12;
  }

  if (hour > 23) return null;
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

  const date = args?.date;
  const serviceName = args?.service_name;
  const preferredTime = args?.preferred_time;

  // Identify business from the called number (normalize to match DB format)
  const calledNumber = normalizePhoneNumber(call?.to_number);
  let phoneNum = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: { include: { services: true } } },
      })
    : null;

  // Demo number fallback: during onboarding, the test number is a shared demo
  // number with no PhoneNumber record — look up via DemoSession.
  if (!phoneNum && calledNumber) {
    const demoBusinessId = await resolveBusinessFromDemo(calledNumber);
    if (demoBusinessId) {
      const demoBusiness = await prisma.business.findUnique({
        where: { id: demoBusinessId },
        include: { services: true },
      });
      if (demoBusiness) {
        phoneNum = { businessId: demoBusinessId, business: demoBusiness } as unknown as typeof phoneNum;
      }
    }
  }

  console.log("[check-availability] to:", call?.to_number, "calledNumber:", calledNumber, "businessFound:", !!phoneNum?.business, "date:", date, "serviceName:", serviceName);

  if (!phoneNum?.business) {
    console.error("[check-availability] Business not found for number:", calledNumber);
    return NextResponse.json({
      result:
        "I apologize, but I'm having trouble accessing the system right now. Let me take your information and have someone call you back.",
    });
  }

  const business = phoneNum.business;
  const timezone = business.timezone || "America/Los_Angeles";
  const requestedDate = normalizeDateInput(date, timezone);
  const preferred = normalizePreferredTime(preferredTime);
  const preferredMinutes = preferred ? timeTextToMinutes(preferred) : null;

  // Find service duration
  const service = business.services.find(
    (s: Service) =>
      s.isActive && s.name.toLowerCase().includes((serviceName || "").toLowerCase())
  );
  const duration = service?.duration || 60;

  // "First available" — scan forward up to 14 days to find the next open slot
  if (requestedDate === NEXT_AVAILABLE_SENTINEL) {
    const todayInTz = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
    }).format(new Date());
    try {
      for (let i = 0; i < 14; i++) {
        const tryDate = addDays(todayInTz, i);
        const trySlots = await getAvailableSlots(business.id, tryDate, duration);
        if (trySlots.length > 0) {
          const spokenDate = formatSpokenDate(tryDate, timezone);
          const offeredSlots = trySlots.slice(0, 3);
          const slotDescriptions = describeAvailableSlots(offeredSlots, timezone);
          const offered = offeredSlots.map((slot) => ({
            start_time: slot.start.toISOString(),
            end_time: slot.end.toISOString(),
            display_time: formatSlotTime(slot.start, timezone),
          }));
          return NextResponse.json({
            result: `The next available time is ${spokenDate} at ${slotDescriptions}. Would any of those work for you?`,
            available: true,
            available_slots: offered,
            timezone,
            normalized_date: tryDate,
          });
        }
      }
      // Nothing found in 14 days (no hours configured or all days disabled).
      // Fall back to guaranteed slots on the next weekday so the demo can proceed.
      const todayInTz2 = new Intl.DateTimeFormat("en-CA", {
        timeZone: timezone,
      }).format(new Date());
      const fallbackDate = nextWeekday(addDays(todayInTz2, 1), timezone);
      const fallbackSlots = buildFallbackSlots(fallbackDate, timezone, duration);
      const fallbackSpoken = formatSpokenDate(fallbackDate, timezone);
      const fallbackDescriptions = describeAvailableSlots(fallbackSlots, timezone);
      const fallbackOffered = fallbackSlots.map((slot) => ({
        start_time: slot.start.toISOString(),
        end_time: slot.end.toISOString(),
        display_time: formatSlotTime(slot.start, timezone),
      }));
      return NextResponse.json({
        result: `The next available time is ${fallbackSpoken} at ${fallbackDescriptions}. Would any of those work for you?`,
        available: true,
        available_slots: fallbackOffered,
        timezone,
        normalized_date: fallbackDate,
      });
    } catch (error) {
      console.error("Error scanning for next available slot:", error);
      return NextResponse.json({
        result:
          "Let me check with the owner on availability. What day and time would work best for you?",
      });
    }
  }

  const spokenDate = formatSpokenDate(requestedDate, timezone);

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

    const offeredSlots = slots.slice(0, 3);
    const offered = offeredSlots.map((slot) => ({
      start_time: slot.start.toISOString(),
      end_time: slot.end.toISOString(),
      display_time: formatSlotTime(slot.start, timezone),
    }));
    const slotDescriptions = describeAvailableSlots(offeredSlots, timezone);
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
