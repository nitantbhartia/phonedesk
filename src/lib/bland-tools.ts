import { timingSafeEqual } from "crypto";
import type { Business, Service } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  formatSpokenSlot,
  phoneBookableServices,
} from "@/lib/bookable";
import {
  bookAppointment,
  getNextOpenSlots,
  isSlotAvailable,
  parseLocalDatetime,
} from "@/lib/calendar";
import { getCalendarHealth } from "@/lib/calendar-health";
import {
  sendBookableConfirmationToCustomer,
  sendBookableOwnerBookingNotice,
  sendBookableRequestToOwner,
} from "@/lib/notifications";
import { normalizePhoneNumber } from "@/lib/phone";

export type BlandShopContext = Business & {
  services: Service[];
  phoneNumber: { number: string } | null;
};

export type BlandToolPayload = {
  to: string;
  from: string;
  callId: string;
  service: string;
  limit: number;
  start: string;
  date: string;
  time: string;
  customerName: string;
  petName: string;
};

function timingSafeEqualString(expected: string, received: string) {
  const a = Buffer.from(expected);
  const b = Buffer.from(received);
  if (a.length !== b.length) {
    timingSafeEqual(a, Buffer.alloc(a.length));
    return false;
  }
  return timingSafeEqual(a, b);
}

export function requireToolSecret(req: Request): boolean {
  const expected = process.env.BLAND_TOOL_SECRET?.trim() || "";
  if (!expected) return false;
  const received = req.headers.get("x-call-slot-tool-secret")?.trim() || "";
  if (!received) return false;
  return timingSafeEqualString(expected, received);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function firstString(objects: Record<string, unknown>[], keys: string[]) {
  for (const obj of objects) {
    for (const key of keys) {
      const value = obj[key];
      if (typeof value === "number" && Number.isFinite(value)) return String(value);
      if (typeof value === "string") {
        const trimmed = value.trim();
        if (trimmed && !trimmed.includes("{{")) return trimmed;
      }
    }
  }
  return "";
}

export function readToolPayload(body: unknown): BlandToolPayload {
  const root = asRecord(body);
  const input = asRecord(root.input || root.args || root.parameters);
  const metadata = asRecord(root.metadata);
  const call = asRecord(root.call);
  const objects = [root, input, metadata, call];
  const limitRaw = Number(firstString(objects, ["limit"]) || "2");
  return {
    to: firstString(objects, ["to", "to_number", "called_number", "inbound_number", "phone_number"]),
    from: firstString(objects, ["from", "from_number", "caller", "customer_phone"]),
    callId: firstString(objects, ["call_id", "callId"]),
    service: firstString(objects, ["service", "service_name", "serviceName"]),
    limit: Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 6) : 2,
    start: firstString(objects, ["start", "start_time", "startTime", "datetime"]),
    date: firstString(objects, ["date"]),
    time: firstString(objects, ["time"]),
    customerName: firstString(objects, ["customer_name", "customerName", "name"]),
    petName: firstString(objects, ["pet_name", "petName"]),
  };
}

export async function resolveShopFromCalledNumber(to: string | null | undefined): Promise<BlandShopContext | null> {
  const raw = (to || "").trim();
  const normalized = normalizePhoneNumber(raw);
  const candidates = Array.from(new Set([raw, normalized].filter((value): value is string => Boolean(value))));
  for (const number of candidates) {
    const row = await prisma.phoneNumber.findUnique({
      where: { number },
      include: {
        business: {
          include: { services: { where: { isActive: true }, orderBy: { createdAt: "asc" } } },
        },
      },
    });
    if (row?.business) {
      return { ...row.business, phoneNumber: { number: row.number } };
    }
  }
  return null;
}

function matchService(shop: BlandShopContext, serviceName?: string) {
  const bookable = phoneBookableServices(shop.services);
  if (bookable.length === 0) return null;
  const needle = (serviceName || "").trim().toLowerCase();
  if (!needle) return bookable[0];
  return (
    bookable.find((service) => service.name.toLowerCase() === needle) ||
    bookable.find((service) => service.name.toLowerCase().includes(needle) || needle.includes(service.name.toLowerCase())) ||
    bookable[0]
  );
}

function parseTimeToHHMM(value: string) {
  const trimmed = value.trim();
  const match24 = trimmed.match(/^([01]?\d|2[0-3]):([0-5]\d)$/);
  if (match24) return `${match24[1].padStart(2, "0")}:${match24[2]}`;
  const match12 = trimmed.match(/^(\d{1,2})(?::([0-5]\d))?\s*(am|pm)$/i);
  if (!match12) return null;
  let hour = Number(match12[1]);
  const minute = match12[2] || "00";
  const period = match12[3].toLowerCase();
  if (period === "pm" && hour < 12) hour += 12;
  if (period === "am" && hour === 12) hour = 0;
  return `${String(hour).padStart(2, "0")}:${minute}`;
}

function parseSlotStart(payload: BlandToolPayload, timezone: string) {
  if (payload.start) {
    const start = parseLocalDatetime(payload.start, timezone);
    if (!Number.isNaN(start.getTime())) return start;
  }
  if (payload.date && payload.time) {
    const hhmm = parseTimeToHHMM(payload.time);
    if (!hhmm) return null;
    const start = parseLocalDatetime(`${payload.date}T${hhmm}:00`, timezone);
    if (!Number.isNaN(start.getTime())) return start;
  }
  return null;
}

export async function getOpeningsForCall(payload: BlandToolPayload) {
  const shop = await resolveShopFromCalledNumber(payload.to);
  if (!shop) return { ok: false as const, error: "Shop not found for that number" };
  const service = matchService(shop, payload.service);
  if (!service) return { ok: false as const, error: "No bookable services" };
  const timezone = shop.timezone || "America/Los_Angeles";
  const slots = await getNextOpenSlots(shop.id, service.duration, {
    days: 7,
    limit: payload.limit || 2,
  });
  return {
    ok: true as const,
    slots: slots.map((slot) => ({
      start: slot.start.toISOString(),
      end: slot.end.toISOString(),
      spoken: formatSpokenSlot(slot.start, timezone),
      serviceId: service.id,
      serviceName: service.name,
    })),
  };
}

export async function bookFromCall(payload: BlandToolPayload) {
  const shop = await resolveShopFromCalledNumber(payload.to);
  if (!shop) return { ok: false as const, error: "Shop not found for that number" };
  const service = matchService(shop, payload.service);
  if (!service) return { ok: false as const, error: "No bookable services" };
  const timezone = shop.timezone || "America/Los_Angeles";
  const start = parseSlotStart(payload, timezone);
  if (!start) return { ok: false as const, error: "Need a start time from GetOpenings" };
  const end = new Date(start.getTime() + service.duration * 60_000);
  const stillOpen = await isSlotAvailable(shop.id, start, end);
  if (!stillOpen) return { ok: false as const, error: "That time is no longer open" };
  const callerPhone = normalizePhoneNumber(payload.from) || payload.from || undefined;
  const customer = callerPhone
    ? await prisma.customer.findUnique({
        where: { businessId_phone: { businessId: shop.id, phone: callerPhone } },
        select: { name: true },
      })
    : null;
  const calendarHealth = await getCalendarHealth(shop.id);
  const knownCaller = Boolean(customer);
  const bookingKind =
    knownCaller && calendarHealth.canWriteEvents && !calendarHealth.forceRequestMode
      ? ("AUTO" as const)
      : ("REQUEST" as const);
  const customerName = payload.customerName || customer?.name || "Caller";
  let appointment;
  try {
    appointment = await bookAppointment(shop.id, {
      customerName,
      customerPhone: callerPhone,
      petName: payload.petName || undefined,
      serviceName: service.name,
      servicePrice: service.price,
      startTime: start,
      endTime: end,
      notes: knownCaller ? "Booked via Call Slot" : "Request via Call Slot — awaiting shop confirm",
      bookingModeOverride: bookingKind === "AUTO" ? "HARD" : "SOFT",
    });
  } catch (error) {
    console.error("[bland-tools] bookAppointment failed:", error);
    return { ok: false as const, error: "Could not book that time" };
  }
  const primary = await prisma.calendarConnection.findFirst({
    where: { businessId: shop.id, isPrimary: true, isActive: true },
  });
  const requiresWrite = primary?.provider === "GOOGLE" || primary?.provider === "SQUARE" || primary?.provider === "ACUITY";
  if (requiresWrite && !appointment.calendarEventId) {
    try {
      await prisma.appointment.update({
        where: { id: appointment.id },
        data: { status: "CANCELLED", notes: "Calendar write failed — released" },
      });
    } catch { /* hold release is best-effort */ }
    return { ok: false as const, error: "Calendar write failed" };
  }
  await sendBookableConfirmationToCustomer(shop, appointment, bookingKind).catch((error) => {
    console.error("[bland-tools] customer SMS failed:", error);
  });
  if (bookingKind === "AUTO") {
    await sendBookableOwnerBookingNotice(shop, appointment).catch((error) => {
      console.error("[bland-tools] owner SMS failed:", error);
    });
  } else {
    await sendBookableRequestToOwner(shop, appointment).catch((error) => {
      console.error("[bland-tools] owner request SMS failed:", error);
    });
  }
  const spoken = formatSpokenSlot(start, timezone);
  return {
    ok: true as const,
    booked: bookingKind === "AUTO",
    requested: bookingKind === "REQUEST",
    spoken,
    serviceName: service.name,
  };
}
