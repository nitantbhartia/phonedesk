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
    start: new Date(`${ymd}T00:00:00`),
    end: new Date(`${ymd}T23:59:59`),
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
