import type { Appointment, BookableSession, Business, Service } from "@prisma/client";
import {
  bookAppointment,
  getNextOpenSlots,
  isSlotAvailable,
  type TimeSlot,
} from "@/lib/calendar";
import { prisma } from "@/lib/prisma";
import {
  sendBookableCallbackToOwner,
  sendBookableConfirmationToCustomer,
  sendBookableOwnerBookingNotice,
  sendBookableRequestToOwner,
} from "@/lib/notifications";
import { normalizePhoneNumber } from "@/lib/phone";

export const BOOKABLE_SLOT_WINDOW_DAYS = 7;
export const BOOKABLE_SLOT_PREFETCH = 6;
export const BOOKABLE_SLOTS_PER_PROMPT = 2;
export const BOOKABLE_MAX_SLOTS_PER_CALL = 6;

export const BANNED_VOICE_COPY = /\bAI\b|virtual receptionist|\bassistant\b/i;

export type BookableState = "menu" | "service" | "slots" | "booked" | "callback" | "done";

export type BookablePrompt = {
  say: string;
  gather?: boolean;
  record?: boolean;
  hangup?: boolean;
  state: BookableState;
  status: BookableSession["status"];
  slots?: SpokenSlot[];
  appointmentId?: string;
};

export type SpokenSlot = {
  start: string;
  end: string;
  spoken: string;
};

export type PrefetchedSlots = Record<string, SpokenSlot[]>;

type ShopContext = Business & {
  services: Service[];
  phoneNumber: { number: string } | null;
};

function assertSafeCopy(text: string) {
  if (BANNED_VOICE_COPY.test(text)) {
    throw new Error(`Bookable copy is not allowed to mention AI receptionist language: ${text}`);
  }
  return text;
}

export function resolveInboundPath(business?: { inboundPath?: string | null } | null) {
  const env = process.env.INBOUND_PATH?.trim().toLowerCase();
  if (env === "retell_agent") return "RETELL_AGENT";
  if (env === "bookable_voicemail") return "BOOKABLE_VOICEMAIL";
  return business?.inboundPath || "BOOKABLE_VOICEMAIL";
}

export function phoneBookableServices(services: Service[]) {
  return services
    .filter((service) => service.isActive && !service.isAddon)
    .slice(0, 3);
}

export function formatSpokenSlot(start: Date, timezone: string) {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
  }).format(start);
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).formatToParts(start);
  const hour = parts.find((part) => part.type === "hour")?.value || "";
  const minute = parts.find((part) => part.type === "minute")?.value || "00";
  const dayPeriod = (
    parts.find((part) => part.type === "dayPeriod")?.value || "pm"
  ).toLowerCase();
  const time = minute === "00" ? `${hour}${dayPeriod}` : `${hour}:${minute}${dayPeriod}`;
  return `${weekday} ${time}`;
}

export function formatConfirmTime(start: Date, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    minute: "2-digit",
    hour12: true,
  }).format(start);
}

export function buildMenuPrompt(shopName: string) {
  return assertSafeCopy(
    `Thanks for calling ${shopName}. To book, press 1. To leave a message, press 9.`
  );
}

export function buildServicePrompt(services: Service[]) {
  if (services.length === 0) {
    return assertSafeCopy("To leave a message, press 9.");
  }
  const choices = services
    .map((service, index) => `For ${service.name}, press ${index + 1}.`)
    .join(" ");
  return assertSafeCopy(`${choices} To leave a message, press 9.`);
}

export function buildSlotPrompt(slots: SpokenSlot[], canOfferMore: boolean) {
  if (slots.length === 0) {
    return assertSafeCopy("To leave a message, press 9.");
  }
  const first = `${slots[0].spoken}, press 1.`;
  const second = slots[1] ? ` ${slots[1].spoken}, press 2.` : "";
  const more = canOfferMore ? " More times, press 3." : " To leave a message, press 9.";
  return assertSafeCopy(`${first}${second}${more}`);
}

export function buildBookedPrompt(
  serviceName: string,
  spokenTime: string,
  kind: "AUTO" | "REQUEST"
) {
  if (kind === "REQUEST") {
    return assertSafeCopy(
      `We have that time requested for ${serviceName}, ${spokenTime}. The shop will confirm by text.`
    );
  }
  return assertSafeCopy(
    `You're booked for ${serviceName}, ${spokenTime}. We'll text you.`
  );
}

export function buildCallbackPrompt() {
  return assertSafeCopy(
    "You can leave a message after the tone. We'll have the shop call you back."
  );
}

function toSpokenSlots(slots: TimeSlot[], timezone: string): SpokenSlot[] {
  return slots.map((slot) => ({
    start: slot.start.toISOString(),
    end: slot.end.toISOString(),
    spoken: formatSpokenSlot(slot.start, timezone),
  }));
}

async function loadShop(businessId: string): Promise<ShopContext | null> {
  return prisma.business.findUnique({
    where: { id: businessId },
    include: {
      services: { where: { isActive: true }, orderBy: { createdAt: "asc" } },
      phoneNumber: true,
    },
  });
}

async function prefetchSlots(shop: ShopContext): Promise<PrefetchedSlots> {
  const timezone = shop.timezone || "America/Los_Angeles";
  const services = phoneBookableServices(shop.services);
  const prefetched: PrefetchedSlots = {};

  await Promise.all(
    services.map(async (service) => {
      const slots = await getNextOpenSlots(shop.id, service.duration, {
        days: BOOKABLE_SLOT_WINDOW_DAYS,
        limit: BOOKABLE_SLOT_PREFETCH,
      });
      prefetched[service.id] = toSpokenSlots(slots, timezone);
    })
  );

  return prefetched;
}

function offeredSlots(session: BookableSession): SpokenSlot[] {
  return Array.isArray(session.slotsOffered)
    ? (session.slotsOffered as SpokenSlot[])
    : [];
}

function prefetchedForService(session: BookableSession, serviceId: string): SpokenSlot[] {
  const all = (session.prefetchedSlots || {}) as PrefetchedSlots;
  return all[serviceId] || [];
}

function canOfferMore(session: BookableSession, serviceId: string) {
  const remaining =
    prefetchedForService(session, serviceId).length - session.slotOffset - BOOKABLE_SLOTS_PER_PROMPT;
  return session.slotsHeard + BOOKABLE_SLOTS_PER_PROMPT < BOOKABLE_MAX_SLOTS_PER_CALL && remaining > 0;
}

export async function startBookableCall(input: {
  businessId: string;
  callSid: string;
  callerPhone?: string | null;
  calledNumber?: string | null;
  callId?: string | null;
}): Promise<{ session: BookableSession; prompt: BookablePrompt; shopName: string }> {
  const shop = await loadShop(input.businessId);
  if (!shop) {
    throw new Error("Business not found");
  }

  const callerPhone = normalizePhoneNumber(input.callerPhone) || input.callerPhone || null;
  const known = callerPhone
    ? await prisma.customer.findUnique({
        where: {
          businessId_phone: {
            businessId: shop.id,
            phone: callerPhone,
          },
        },
      })
    : null;

  const prefetchedSlots = await prefetchSlots(shop).catch((error) => {
    console.error("[bookable] prefetch failed:", error);
    return {} as PrefetchedSlots;
  });

  const existing = await prisma.bookableSession.findUnique({
    where: { callSid: input.callSid },
  });
  const session =
    existing ||
    (await prisma.bookableSession.create({
      data: {
        businessId: shop.id,
        callId: input.callId || undefined,
        callSid: input.callSid,
        callerPhone,
        calledNumber: input.calledNumber || null,
        state: "menu",
        status: "IN_PROGRESS",
        knownCaller: Boolean(known),
        prefetchedSlots,
      },
    }));

  const prompt: BookablePrompt = {
    say: buildMenuPrompt(shop.name),
    gather: true,
    state: "menu",
    status: session.status,
  };

  return { session, prompt, shopName: shop.name };
}

function terminalPrompt(session: BookableSession, say: string, extra: Partial<BookablePrompt> = {}): BookablePrompt {
  return {
    say,
    hangup: extra.record ? false : true,
    record: extra.record,
    gather: extra.gather,
    state: (extra.state as BookableState) || (session.state as BookableState),
    status: extra.status || session.status,
    slots: extra.slots,
    appointmentId: extra.appointmentId || session.appointmentId || undefined,
  };
}

async function offerSlots(
  session: BookableSession,
  shop: ShopContext,
  service: Service,
  offset = 0
): Promise<{ session: BookableSession; prompt: BookablePrompt }> {
  const timezone = shop.timezone || "America/Los_Angeles";
  let pool = prefetchedForService(session, service.id);
  if (pool.length <= offset) {
    const live = await getNextOpenSlots(shop.id, service.duration, {
      days: BOOKABLE_SLOT_WINDOW_DAYS,
      limit: BOOKABLE_SLOT_PREFETCH,
      offset,
    });
    pool = toSpokenSlots(live, timezone);
  }

  const next = pool.slice(offset, offset + BOOKABLE_SLOTS_PER_PROMPT);
  if (next.length === 0) {
    return fallToCallback(session, shop, "no_slots");
  }

  const slotsHeard = Math.min(offset + next.length, BOOKABLE_MAX_SLOTS_PER_CALL);
  const updated = await prisma.bookableSession.update({
    where: { id: session.id },
    data: {
      state: "slots",
      serviceId: service.id,
      slotOffset: offset,
      slotsHeard,
      slotsOffered: next,
      status: "IN_PROGRESS",
    },
  });

  return {
    session: updated,
    prompt: {
      say: buildSlotPrompt(next, canOfferMore({ ...updated, prefetchedSlots: session.prefetchedSlots }, service.id)),
      gather: true,
      state: "slots",
      status: "IN_PROGRESS",
      slots: next,
    },
  };
}

async function fallToCallback(
  session: BookableSession,
  shop: ShopContext,
  reason: "no_slots" | "calendar_failed" | "digit"
): Promise<{ session: BookableSession; prompt: BookablePrompt }> {
  const updated = await prisma.bookableSession.update({
    where: { id: session.id },
    data: {
      state: "callback",
      status: reason === "no_slots" ? "NO_SLOTS" : "CALLBACK",
    },
  });

  await notifyCallback(shop, updated).catch((error) => {
    console.error("[bookable] callback notify failed:", error);
  });

  if (updated.callId) {
    try {
      await prisma.call.update({
        where: { id: updated.callId },
        data: {
          status: "CALLBACK",
          summary:
            reason === "no_slots"
              ? "No openings — caller offered callback"
              : "Caller asked for a callback",
        },
      });
    } catch {
      // Call row update is non-blocking.
    }
  }

  return {
    session: updated,
    prompt: {
      say: buildCallbackPrompt(),
      record: true,
      state: "callback",
      status: updated.status,
    },
  };
}

async function notifyCallback(shop: ShopContext, session: BookableSession, recordingUrl?: string) {
  const result = await sendBookableCallbackToOwner(shop, {
    callerPhone: session.callerPhone,
    recordingUrl,
  });
  await prisma.bookableSession.update({
    where: { id: session.id },
    data: { smsOwnerStatus: result },
  });
}

async function resolveService(shop: ShopContext, digit: string) {
  const services = phoneBookableServices(shop.services);
  const index = Number(digit) - 1;
  return services[index] || null;
}

async function bookOfferedSlot(
  session: BookableSession,
  shop: ShopContext,
  slotIndex: number
): Promise<{ session: BookableSession; prompt: BookablePrompt }> {
  if (session.status === "BOOKED" || session.status === "REQUESTED") {
    const serviceName =
      shop.services.find((service) => service.id === session.serviceId)?.name || "your appointment";
    return {
      session,
      prompt: terminalPrompt(
        session,
        buildBookedPrompt(
          serviceName,
          offeredSlots(session)[0]?.spoken || "the selected time",
          session.bookingKind === "AUTO" ? "AUTO" : "REQUEST"
        ),
        { appointmentId: session.appointmentId || undefined }
      ),
    };
  }

  const service = shop.services.find((entry) => entry.id === session.serviceId);
  if (!service) {
    return fallToCallback(session, shop, "no_slots");
  }

  const timezone = shop.timezone || "America/Los_Angeles";
  const offered = offeredSlots(session);
  const chosen = offered[slotIndex];
  const pool = prefetchedForService(session, service.id);
  const candidates = [
    chosen,
    ...pool.filter((slot) => slot.start !== chosen?.start),
    ...offered.filter((slot, index) => index !== slotIndex),
  ].filter(Boolean);

  let selected: SpokenSlot | undefined;
  for (const candidate of candidates) {
    const start = new Date(candidate.start);
    const end = new Date(candidate.end);
    const open = await isSlotAvailable(shop.id, start, end);
    if (open) {
      selected = candidate;
      break;
    }
  }

  if (!selected) {
    const live = await getNextOpenSlots(shop.id, service.duration, {
      days: BOOKABLE_SLOT_WINDOW_DAYS,
      limit: 1,
    });
    if (live[0]) {
      selected = toSpokenSlots(live, timezone)[0];
    }
  }

  if (!selected) {
    return fallToCallback(session, shop, "no_slots");
  }

  const start = new Date(selected.start);
  const end = new Date(selected.end);
  const stillOpen = await isSlotAvailable(shop.id, start, end);
  if (!stillOpen) {
    return fallToCallback(session, shop, "no_slots");
  }

  const knownName = session.knownCaller && session.callerPhone
    ? (
        await prisma.customer.findUnique({
          where: {
            businessId_phone: { businessId: shop.id, phone: session.callerPhone },
          },
          select: { name: true },
        })
      )?.name
    : null;

  const bookingKind = session.knownCaller ? "AUTO" : "REQUEST";
  let appointment: Appointment;
  try {
    appointment = await bookAppointment(shop.id, {
      customerName: knownName || "Caller",
      customerPhone: session.callerPhone || undefined,
      serviceName: service.name,
      servicePrice: service.price,
      startTime: start,
      endTime: end,
      notes: session.knownCaller ? "Booked via Bookable" : "Request via Bookable — awaiting shop confirm",
      bookingModeOverride: bookingKind === "AUTO" ? "HARD" : "SOFT",
    });
  } catch (error) {
    console.error("[bookable] bookAppointment failed:", error);
    return fallToCallback(session, shop, "calendar_failed");
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
    } catch {
      // Hold release is best-effort; caller still goes to callback.
    }
    return fallToCallback(session, shop, "calendar_failed");
  }

  const smsCustomer = await sendBookableConfirmationToCustomer(shop, appointment, bookingKind);
  const smsOwner =
    bookingKind === "AUTO"
      ? await sendBookableOwnerBookingNotice(shop, appointment)
      : await sendBookableRequestToOwner(shop, appointment);

  const updated = await prisma.bookableSession.update({
    where: { id: session.id },
    data: {
      state: "booked",
      status: bookingKind === "AUTO" ? "BOOKED" : "REQUESTED",
      bookingKind,
      appointmentId: appointment.id,
      calendarEventId: appointment.calendarEventId,
      smsCustomerStatus: smsCustomer,
      smsOwnerStatus: smsOwner,
      slotsOffered: [selected],
    },
  });

  if (updated.callId) {
    try {
      await prisma.call.update({
        where: { id: updated.callId },
        data: {
          status: "COMPLETED",
          appointmentId: appointment.id,
          callerName: appointment.customerName,
          summary:
            bookingKind === "AUTO"
              ? `Booked ${service.name} ${selected.spoken}`
              : `Requested ${service.name} ${selected.spoken}`,
        },
      });
    } catch {
      // Call row update is non-blocking.
    }
  }

  return {
    session: updated,
    prompt: terminalPrompt(
      updated,
      buildBookedPrompt(service.name, selected.spoken, bookingKind),
      { appointmentId: appointment.id, status: updated.status, state: "booked" }
    ),
  };
}

export async function handleBookableDigit(
  session: BookableSession,
  digit: string | null
): Promise<{ session: BookableSession; prompt: BookablePrompt }> {
  const shop = await loadShop(session.businessId);
  if (!shop) {
    throw new Error("Business not found");
  }

  const pressed = (digit || "").trim();
  if (
    (session.status === "BOOKED" || session.status === "REQUESTED") &&
    (pressed === "1" || pressed === "2")
  ) {
    return bookOfferedSlot(session, shop, 0);
  }
  if (session.status === "CALLBACK" || session.status === "NO_SLOTS" || session.status === "FAILED") {
    return {
      session,
      prompt: {
        say: buildCallbackPrompt(),
        record: true,
        state: "callback",
        status: session.status,
      },
    };
  }

  await prisma.bookableSession.update({
    where: { id: session.id },
    data: { lastDigit: pressed || null },
  });

  if (session.state === "menu") {
    if (pressed === "1") {
      const services = phoneBookableServices(shop.services);
      if (services.length === 0) {
        return fallToCallback(session, shop, "no_slots");
      }
      if (services.length === 1) {
        return offerSlots(session, shop, services[0], 0);
      }
      const updated = await prisma.bookableSession.update({
        where: { id: session.id },
        data: { state: "service" },
      });
      return {
        session: updated,
        prompt: {
          say: buildServicePrompt(services),
          gather: true,
          state: "service",
          status: "IN_PROGRESS",
        },
      };
    }
    if (pressed === "9") {
      return fallToCallback(session, shop, "digit");
    }
    return {
      session,
      prompt: {
        say: buildMenuPrompt(shop.name),
        gather: true,
        state: "menu",
        status: "IN_PROGRESS",
      },
    };
  }

  if (session.state === "service") {
    if (pressed === "9") {
      return fallToCallback(session, shop, "digit");
    }
    const service = await resolveService(shop, pressed);
    if (!service) {
      return {
        session,
        prompt: {
          say: buildServicePrompt(phoneBookableServices(shop.services)),
          gather: true,
          state: "service",
          status: "IN_PROGRESS",
        },
      };
    }
    return offerSlots(session, shop, service, 0);
  }

  if (session.state === "slots") {
    if (pressed === "9") {
      return fallToCallback(session, shop, "digit");
    }
    if (pressed === "1" || pressed === "2") {
      return bookOfferedSlot(session, shop, pressed === "1" ? 0 : 1);
    }
    if (pressed === "3") {
      const service = shop.services.find((entry) => entry.id === session.serviceId);
      if (!service) {
        return fallToCallback(session, shop, "no_slots");
      }
      if (session.slotsHeard >= BOOKABLE_MAX_SLOTS_PER_CALL) {
        return fallToCallback(session, shop, "digit");
      }
      return offerSlots(session, shop, service, session.slotOffset + BOOKABLE_SLOTS_PER_PROMPT);
    }
    const current = offeredSlots(session);
    return {
      session,
      prompt: {
        say: buildSlotPrompt(
          current,
          session.serviceId ? canOfferMore(session, session.serviceId) : false
        ),
        gather: true,
        state: "slots",
        status: "IN_PROGRESS",
        slots: current,
      },
    };
  }

  if (pressed === "9") {
    return fallToCallback(session, shop, "digit");
  }

  return {
    session,
    prompt: {
      say: buildMenuPrompt(shop.name),
      gather: true,
      state: "menu",
      status: "IN_PROGRESS",
    },
  };
}

export async function attachBookableRecording(sessionId: string, recordingUrl: string) {
  const session = await prisma.bookableSession.update({
    where: { id: sessionId },
    data: { recordingUrl, status: "CALLBACK", state: "callback" },
  });
  const shop = await loadShop(session.businessId);
  if (shop) {
    await notifyCallback(shop, session, recordingUrl).catch((error) => {
      console.error("[bookable] recording notify failed:", error);
    });
  }
  if (session.callId) {
    try {
      await prisma.call.update({
        where: { id: session.callId },
        data: { recordingUrl, status: "CALLBACK" },
      });
    } catch {
      // Call row update is non-blocking.
    }
  }
  return session;
}
