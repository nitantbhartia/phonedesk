import { NextRequest, NextResponse } from "next/server";
import type { Business, PhoneNumber, Service } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { normalizePhoneNumber } from "@/lib/phone";
import { resolveBusinessFromDemo } from "@/lib/demo-session";
import { parseLocalDatetime } from "@/lib/calendar";

type RetellArgs = Record<string, string>;
type RetellCall = Record<string, string>;

export type ParsedRetellRequest = {
  args: RetellArgs;
  call: RetellCall;
};

export type RetellBusiness = Business & {
  phoneNumber: PhoneNumber | null;
  services: Service[];
};

export async function parseRetellRequest(
  req: NextRequest
): Promise<ParsedRetellRequest | NextResponse> {
  const rawBody = await req.text();
  const signature = req.headers.get("x-retell-signature") || "";

  if (!isRetellWebhookValid(rawBody, signature, req.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const body = JSON.parse(rawBody || "{}") as {
      args?: RetellArgs;
      call?: RetellCall;
    };

    return {
      args: body.args || {},
      call: body.call || {},
    };
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
}

export async function resolveRetellBusiness(
  toNumber: string | undefined
): Promise<RetellBusiness | null> {
  const calledNumber = normalizePhoneNumber(toNumber);

  let phoneRecord = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: {
          business: {
            include: {
              phoneNumber: true,
              services: true,
            },
          },
        },
      })
    : null;

  if (!phoneRecord && calledNumber) {
    const demoBusinessId = await resolveBusinessFromDemo(calledNumber);
    if (demoBusinessId) {
      const demoBusiness = await prisma.business.findUnique({
        where: { id: demoBusinessId },
        include: {
          phoneNumber: true,
          services: true,
        },
      });
      if (demoBusiness) {
        phoneRecord = {
          businessId: demoBusinessId,
          business: demoBusiness,
        } as unknown as typeof phoneRecord;
      }
    }
  }

  return phoneRecord?.business || null;
}

export function formatRetellDateTime(date: Date, timezone?: string | null): string {
  return date.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone || "America/Los_Angeles",
  });
}

export function getTodayBoundsInTimezone(
  timezone: string,
  referenceDate: Date = new Date()
) {
  const ymd = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
  }).format(referenceDate);

  return {
    start: parseLocalDatetime(`${ymd}T00:00:00`, timezone),
    end: parseLocalDatetime(`${ymd}T23:59:59`, timezone),
  };
}

export function parseRetellDateInput(
  input: string,
  timezone: string
): Date | null {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parsed = parseLocalDatetime(`${trimmed}T12:00:00`, timezone);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
    const parsed = parseLocalDatetime(trimmed, timezone);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function formatBusinessHours(
  businessHours: Business["businessHours"]
): string | null {
  if (!businessHours || typeof businessHours !== "object") {
    return null;
  }

  const dayNames: Record<string, string> = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  };

  const hours = businessHours as Record<string, { open?: string; close?: string }>;
  const lines = Object.entries(hours)
    .filter(([, value]) => value?.open && value?.close)
    .map(([day, value]) => `${dayNames[day] || day}: ${value.open}-${value.close}`);

  return lines.length > 0 ? lines.join(", ") : null;
}

function normalizeServiceKey(value: string) {
  return value
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]+/g, " ")
    .replace(/\s+/g, " ");
}

export function matchActiveService<T extends { isActive: boolean; name: string }>(
  services: T[],
  requestedName?: string | null
): T | null {
  const normalizedQuery = requestedName ? normalizeServiceKey(requestedName) : "";
  if (!normalizedQuery) {
    return null;
  }

  const activeServices = services.filter((service) => service.isActive);
  const exactMatch =
    activeServices.find(
      (service) => normalizeServiceKey(service.name) === normalizedQuery
    ) || null;

  if (exactMatch) {
    return exactMatch;
  }

  return (
    activeServices.find((service) => {
      const normalizedServiceName = normalizeServiceKey(service.name);
      return (
        normalizedServiceName.includes(normalizedQuery) ||
        normalizedQuery.includes(normalizedServiceName)
      );
    }) || null
  );
}

function parseLocalTimeToMinutes(time: string) {
  const match = time.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) {
    return null;
  }

  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    return null;
  }

  return hour * 60 + minute;
}

export function getBusinessOpenState(
  businessHours: Business["businessHours"],
  timezone: string,
  referenceDate: Date = new Date()
) {
  if (!businessHours || typeof businessHours !== "object") {
    return null;
  }

  const dayLookup: Record<string, string> = {
    monday: "mon",
    tuesday: "tue",
    wednesday: "wed",
    thursday: "thu",
    friday: "fri",
    saturday: "sat",
    sunday: "sun",
  };

  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
  })
    .format(referenceDate)
    .toLowerCase();

  const dayKey = dayLookup[weekday];
  const todayHours = dayKey
    ? (businessHours as Record<string, { open?: string; close?: string }>)[dayKey]
    : undefined;

  if (!todayHours?.open || !todayHours?.close) {
    return {
      isOpenNow: false,
      hasHoursToday: false,
    };
  }

  const timeParts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(referenceDate);

  const currentHour = Number(
    timeParts.find((part) => part.type === "hour")?.value || "0"
  );
  const currentMinute = Number(
    timeParts.find((part) => part.type === "minute")?.value || "0"
  );
  const currentMinutes = currentHour * 60 + currentMinute;
  const openMinutes = parseLocalTimeToMinutes(todayHours.open);
  const closeMinutes = parseLocalTimeToMinutes(todayHours.close);

  if (openMinutes === null || closeMinutes === null) {
    return null;
  }

  const isOpenNow =
    closeMinutes > openMinutes
      ? currentMinutes >= openMinutes && currentMinutes < closeMinutes
      : currentMinutes >= openMinutes || currentMinutes < closeMinutes;

  return {
    isOpenNow,
    hasHoursToday: true,
  };
}
