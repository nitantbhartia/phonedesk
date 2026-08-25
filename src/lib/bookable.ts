import type { Appointment, BookableSession, Business, Service } from "@prisma/client";
import {
  bookAppointment,
  getNextOpenSlots,
  isSlotAvailable,
  type TimeSlot,
} from "@/lib/calendar";
import { trackBookableEvent } from "@/lib/bookable-analytics";
import { getCalendarHealth } from "@/lib/calendar-health";
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

export type BookableState =
  | "menu"
  | "service"
  | "slots"
  | "booked"
  | "callback"
  | "pricing"
  | "done";

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
  // Call Slot's live line is always the Twilio keypad flow. Keep the legacy
  // database field readable for old records, but never route a live call to
  // the retired conversational provider.
  void business;
  return "BOOKABLE_VOICEMAIL";
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

type BusinessHoursMap = Record<string, { open: string; close: string }>;

function parseHourMinute(value: string) {
  const [hourRaw, minuteRaw] = value.split(":");
  return { hour: Number(hourRaw), minute: Number(minuteRaw || "0") };
}

export function isShopOpenNow(
  businessHours: BusinessHoursMap | null | undefined,
  timezone: string,
  at: Date = new Date()
) {
  if (!businessHours || Object.keys(businessHours).length === 0) {
    return true;
  }

  const dayNames = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    hour: "numeric",
    minute: "numeric",
    hour12: false,
  }).formatToParts(at);
  const weekday = (parts.find((part) => part.type === "weekday")?.value || "").toLowerCase();
  const dayKey = dayNames.find((key) => weekday.startsWith(key.slice(0, 3))) || "mon";
  const hour = Number(parts.find((part) => part.type === "hour")?.value || "0");
  const minute = Number(parts.find((part) => part.type === "minute")?.value || "0");
  const nowMinutes = hour * 60 + minute;

  const dayHours =
    businessHours[dayKey] ||
    businessHours["mon-fri"] ||
    businessHours.mon;
  if (!dayHours?.open || !dayHours?.close) {
    return false;
  }

  const open = parseHourMinute(dayHours.open);
  const close = parseHourMinute(dayHours.close);
  const openMinutes = open.hour * 60 + open.minute;
  const closeMinutes = close.hour * 60 + close.minute;
  return nowMinutes >= openMinutes && nowMinutes < closeMinutes;
}

export function buildHoursSummary(businessHours: BusinessHoursMap | null | undefined) {
  if (!businessHours || Object.keys(businessHours).length === 0) {
    return "Hours vary — call back for details.";
  }
  const weekday = businessHours["mon-fri"] || businessHours.mon;
  const saturday = businessHours.sat || businessHours.saturday;
  const parts: string[] = [];
  if (weekday?.open && weekday?.close) {
    parts.push(`weekdays ${formatHourLabel(weekday.open)} to ${formatHourLabel(weekday.close)}`);
  }
  if (saturday?.open && saturday?.close) {
    parts.push(`Saturdays ${formatHourLabel(saturday.open)} to ${formatHourLabel(saturday.close)}`);
  }
  return parts.length > 0 ? `We're open ${parts.join(", ")}.` : "Hours vary — call back for details.";
}

function formatHourLabel(value: string) {
  const { hour, minute } = parseHourMinute(value);
  const meridiem = hour >= 12 ? "pm" : "am";
  const twelve = hour % 12 || 12;
  return minute === 0 ? `${twelve}${meridiem}` : `${twelve}:${minute.toString().padStart(2, "0")}${meridiem}`;
}

export function buildPricingLine(services: Service[], businessHours: BusinessHoursMap | null | undefined) {
  const hours = buildHoursSummary(businessHours);
  const bookable = phoneBookableServices(services);
  const priced = bookable
    .filter((service) => Number(service.price) > 0)
    .map((service) => `${service.name.toLowerCase()} from $${Math.round(Number(service.price))}`);
  const pricing =
    priced.length > 0 ? ` ${priced.join(". ")}.` : "";
  return assertSafeCopy(`${hours}${pricing}`);
}

export function buildMenuPrompt(
  shopName: string,
  options: {
    isOpen?: boolean;
    knownUsual?: { petName: string; serviceName: string } | null;
  } = {}
) {
  const statusLine = options.isOpen === false
    ? "We're currently closed."
    : "We're helping another customer right now.";
  const base = `${shopName}. ${statusLine}`;
  const usual = options.knownUsual
    ? ` To book ${options.knownUsual.petName}'s usual ${options.knownUsual.serviceName}, press 1. For another service, press 3.`
    : " To book, press 1.";
  return assertSafeCopy(
    `${base}${usual} For hours and pricing, press 2. To leave a message, press 9. Press 0 to hear this again.`
  );
}

export function buildServicePrompt(services: Service[]) {
  if (services.length === 0) {
    return assertSafeCopy("To leave a message, press 9. Press 0 to hear the menu again.");
  }
  const choices = services
    .map((service, index) => `For ${service.name}, press ${index + 1}.`)
    .join(" ");
  return assertSafeCopy(`${choices} To leave a message, press 9. Press 0 to hear the menu again.`);
}

export function buildSlotPrompt(
  slots: SpokenSlot[],
  canOfferMore: boolean,
  requestMode = false
) {
  if (slots.length === 0) {
    return assertSafeCopy("To leave a message, press 9. Press 0 to hear the menu again.");
  }
  const prefix = requestMode ? "Next openings we can request: " : "Next openings: ";
  const first = `${slots[0].spoken}, press 1.`;
  const second = slots[1] ? ` ${slots[1].spoken}, press 2.` : "";
  const more = canOfferMore ? " More times, press 3." : " To leave a message, press 9.";
  return assertSafeCopy(`${prefix}${first}${second}${more} Press 0 to hear the menu again.`);
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

async function resolveKnownUsual(
  businessId: string,
  callerPhone: string | null | undefined,
  services: Service[]
) {
  if (!callerPhone) return null;
  const customer = await prisma.customer.findUnique({
    where: {
      businessId_phone: { businessId, phone: callerPhone },
    },
    include: {
      pets: { take: 1, orderBy: { updatedAt: "desc" } },
    },
  });
  if (!customer?.lastServiceName) return null;

  const usualService =
    services.find(
      (service) =>
        service.name.toLowerCase() === customer.lastServiceName?.toLowerCase()
    ) || services[0];
  if (!usualService) return null;

  return {
    customer,
    usualService,
    petName: customer.pets[0]?.name || customer.name.split(" ")[0] || "your pet",
    serviceName: usualService.name,
  };
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
  const knownUsual = await resolveKnownUsual(shop.id, callerPhone, shop.services);
  const known = knownUsual?.customer || null;

  const prefetchedSlots = await prefetchSlots(shop).catch((error) => {
    console.error("[bookable] prefetch failed:", error);
    return {} as PrefetchedSlots;
  });

  const callStartedAt = new Date();
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
        usualServiceId: knownUsual?.usualService.id,
        usualPetName: knownUsual?.petName,
        prefetchedSlots,
        callStartedAt,
      },
    }));

  const isOpen = isShopOpenNow(
    shop.businessHours as BusinessHoursMap | null,
    shop.timezone || "America/Los_Angeles"
  );
  const menuSay = buildMenuPrompt(shop.name, {
    isOpen,
    knownUsual: knownUsual
      ? { petName: knownUsual.petName, serviceName: knownUsual.serviceName }
      : null,
  });

  await trackBookableEvent({
    businessId: shop.id,
    sessionId: session.id,
    callId: input.callId,
    event: "call_forwarded",
    callStartedAt: session.callStartedAt || callStartedAt,
  });
  await trackBookableEvent({
    businessId: shop.id,
    sessionId: session.id,
    callId: input.callId,
    event: "menu_started",
    callStartedAt: session.callStartedAt || callStartedAt,
  });

  const prompt: BookablePrompt = {
    say: menuSay,
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
  offset = 0,
  requestMode = false
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
      invalidAttempts: 0,
    },
  });

  await trackBookableEvent({
    businessId: shop.id,
    sessionId: updated.id,
    callId: updated.callId,
    event: offset === 0 ? "slots_requested" : "slots_presented",
    callStartedAt: updated.callStartedAt,
    metadata: { serviceId: service.id, offset },
  });
  await trackBookableEvent({
    businessId: shop.id,
    sessionId: updated.id,
    callId: updated.callId,
    event: "slots_presented",
    callStartedAt: updated.callStartedAt,
    metadata: { slots: next.map((slot) => slot.spoken) },
  });

  return {
    session: updated,
    prompt: {
      say: buildSlotPrompt(
        next,
        canOfferMore({ ...updated, prefetchedSlots: session.prefetchedSlots }, service.id),
        requestMode
      ),
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
  reason: "no_slots" | "calendar_failed" | "digit" | "invalid"
): Promise<{ session: BookableSession; prompt: BookablePrompt }> {
  const updated = await prisma.bookableSession.update({
    where: { id: session.id },
    data: {
      state: "callback",
      status: reason === "no_slots" ? "NO_SLOTS" : "CALLBACK",
    },
  });

  if (reason === "digit" || reason === "invalid") {
    await trackBookableEvent({
      businessId: shop.id,
      sessionId: updated.id,
      callId: updated.callId,
      event: "callback_selected",
      callStartedAt: updated.callStartedAt,
    });
  }

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

  await trackBookableEvent({
    businessId: shop.id,
    sessionId: session.id,
    callId: session.callId,
    event: "slot_selected",
    digit: String(slotIndex + 1),
    callStartedAt: session.callStartedAt,
    metadata: { slot: selected.spoken, serviceId: service.id },
  });
  await trackBookableEvent({
    businessId: shop.id,
    sessionId: session.id,
    callId: session.callId,
    event: "booking_started",
    callStartedAt: session.callStartedAt,
  });

  const calendarHealth = await getCalendarHealth(shop.id);
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

  const bookingKind =
    session.knownCaller && calendarHealth.canWriteEvents && !calendarHealth.forceRequestMode
      ? "AUTO"
      : "REQUEST";
  let appointment: Appointment;
  try {
    appointment = await bookAppointment(shop.id, {
      customerName: knownName || "Caller",
      customerPhone: session.callerPhone || undefined,
      serviceName: service.name,
      servicePrice: service.price,
      startTime: start,
      endTime: end,
      notes: session.knownCaller ? "Booked via Call Slot" : "Request via Call Slot — awaiting shop confirm",
      bookingModeOverride: bookingKind === "AUTO" ? "HARD" : "SOFT",
    });
  } catch (error) {
    console.error("[bookable] bookAppointment failed:", error);
    await trackBookableEvent({
      businessId: shop.id,
      sessionId: session.id,
      callId: session.callId,
      event: "booking_failed",
      callStartedAt: session.callStartedAt,
    });
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
      slotsOffered: offered,
      slotSelected: selected,
    },
  });

  await trackBookableEvent({
    businessId: shop.id,
    sessionId: updated.id,
    callId: updated.callId,
    event: "booking_succeeded",
    callStartedAt: updated.callStartedAt,
    metadata: { appointmentId: appointment.id, bookingKind },
  });
  if (smsCustomer === "sent" || smsOwner === "sent") {
    await trackBookableEvent({
      businessId: shop.id,
      sessionId: updated.id,
      callId: updated.callId,
      event: "sms_sent",
      callStartedAt: updated.callStartedAt,
    });
  }

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

async function menuPromptForSession(session: BookableSession, shop: ShopContext) {
  const isOpen = isShopOpenNow(
    shop.businessHours as BusinessHoursMap | null,
    shop.timezone || "America/Los_Angeles"
  );
  const usual =
    session.usualServiceId && session.usualPetName
      ? {
          petName: session.usualPetName,
          serviceName:
            shop.services.find((service) => service.id === session.usualServiceId)?.name ||
            "appointment",
        }
      : null;
  return buildMenuPrompt(shop.name, { isOpen, knownUsual: usual });
}

async function beginServiceSelection(
  session: BookableSession,
  shop: ShopContext,
  requestMode = false
) {
  const services = phoneBookableServices(shop.services);
  if (services.length === 0) {
    return fallToCallback(session, shop, "no_slots");
  }
  if (services.length === 1) {
    await trackBookableEvent({
      businessId: shop.id,
      sessionId: session.id,
      callId: session.callId,
      event: "service_selected",
      callStartedAt: session.callStartedAt,
      metadata: { serviceId: services[0].id },
    });
    return offerSlots(session, shop, services[0], 0, requestMode);
  }
  const updated = await prisma.bookableSession.update({
    where: { id: session.id },
    data: { state: "service", invalidAttempts: 0 },
  });
  return {
    session: updated,
    prompt: {
      say: buildServicePrompt(services),
      gather: true,
      state: "service" as const,
      status: "IN_PROGRESS" as const,
    },
  };
}

async function handleInvalidDigit(
  session: BookableSession,
  shop: ShopContext,
  repeatSay: string,
  state: BookableState
): Promise<{ session: BookableSession; prompt: BookablePrompt }> {
  const attempts = (session.invalidAttempts || 0) + 1;
  if (attempts >= 2) {
    return fallToCallback(session, shop, "invalid");
  }
  const updated = await prisma.bookableSession.update({
    where: { id: session.id },
    data: { invalidAttempts: attempts },
  });
  return {
    session: updated,
    prompt: {
      say: repeatSay,
      gather: true,
      state,
      status: updated.status,
    },
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
  const calendarHealth = await getCalendarHealth(shop.id);
  const requestMode = calendarHealth.forceRequestMode;

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

  if (pressed && pressed !== "0") {
    await trackBookableEvent({
      businessId: shop.id,
      sessionId: session.id,
      callId: session.callId,
      event: "menu_digit_pressed",
      digit: pressed,
      callStartedAt: session.callStartedAt,
      metadata: { state: session.state },
    });
  }

  await prisma.bookableSession.update({
    where: { id: session.id },
    data: { lastDigit: pressed || null },
  });

  if (pressed === "0") {
    if (session.state === "menu") {
      return {
        session,
        prompt: {
          say: await menuPromptForSession(session, shop),
          gather: true,
          state: "menu",
          status: session.status,
        },
      };
    }
    if (session.state === "service") {
      return {
        session,
        prompt: {
          say: buildServicePrompt(phoneBookableServices(shop.services)),
          gather: true,
          state: "service",
          status: session.status,
        },
      };
    }
    if (session.state === "slots") {
      const current = offeredSlots(session);
      return {
        session,
        prompt: {
          say: buildSlotPrompt(
            current,
            session.serviceId ? canOfferMore(session, session.serviceId) : false,
            requestMode
          ),
          gather: true,
          state: "slots",
          status: session.status,
          slots: current,
        },
      };
    }
    return {
      session,
      prompt: {
        say: await menuPromptForSession(session, shop),
        gather: true,
        state: "menu",
        status: session.status,
      },
    };
  }

  if (session.state === "menu") {
    if (pressed === "1") {
      await trackBookableEvent({
        businessId: shop.id,
        sessionId: session.id,
        callId: session.callId,
        event: "booking_selected",
        digit: pressed,
        callStartedAt: session.callStartedAt,
      });
      if (session.knownCaller && session.usualServiceId) {
        const usual = shop.services.find((service) => service.id === session.usualServiceId);
        if (usual) {
          await trackBookableEvent({
            businessId: shop.id,
            sessionId: session.id,
            callId: session.callId,
            event: "service_selected",
            callStartedAt: session.callStartedAt,
            metadata: { serviceId: usual.id, usual: true },
          });
          return offerSlots(session, shop, usual, 0, requestMode);
        }
      }
      return beginServiceSelection(session, shop, requestMode);
    }
    if (pressed === "2") {
      const pricing = buildPricingLine(
        shop.services,
        shop.businessHours as BusinessHoursMap | null
      );
      await trackBookableEvent({
        businessId: shop.id,
        sessionId: session.id,
        callId: session.callId,
        event: "pricing_heard",
        callStartedAt: session.callStartedAt,
      });
      const updated = await prisma.bookableSession.update({
        where: { id: session.id },
        data: { state: "pricing", invalidAttempts: 0 },
      });
      const selection = await beginServiceSelection(updated, shop, requestMode);
      return {
        session: selection.session,
        prompt: {
          say: `${pricing} ${selection.prompt.say}`,
          gather: selection.prompt.gather,
          state: selection.prompt.state,
          status: selection.prompt.status,
          slots: selection.prompt.slots,
        },
      };
    }
    if (pressed === "3" && session.knownCaller) {
      await trackBookableEvent({
        businessId: shop.id,
        sessionId: session.id,
        callId: session.callId,
        event: "booking_selected",
        digit: pressed,
        callStartedAt: session.callStartedAt,
        metadata: { otherService: true },
      });
      return beginServiceSelection(session, shop, requestMode);
    }
    if (pressed === "9") {
      return fallToCallback(session, shop, "digit");
    }
    if (!pressed) {
      return {
        session,
        prompt: {
          say: await menuPromptForSession(session, shop),
          gather: true,
          state: "menu",
          status: session.status,
        },
      };
    }
    return handleInvalidDigit(session, shop, await menuPromptForSession(session, shop), "menu");
  }

  if (session.state === "service" || session.state === "pricing") {
    if (pressed === "9") {
      return fallToCallback(session, shop, "digit");
    }
    const service = await resolveService(shop, pressed);
    if (!service) {
      return handleInvalidDigit(
        session,
        shop,
        buildServicePrompt(phoneBookableServices(shop.services)),
        "service"
      );
    }
    await trackBookableEvent({
      businessId: shop.id,
      sessionId: session.id,
      callId: session.callId,
      event: "service_selected",
      callStartedAt: session.callStartedAt,
      metadata: { serviceId: service.id },
    });
    return offerSlots(session, shop, service, 0, requestMode);
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
      return offerSlots(session, shop, service, session.slotOffset + BOOKABLE_SLOTS_PER_PROMPT, requestMode);
    }
    const current = offeredSlots(session);
    return handleInvalidDigit(
      session,
      shop,
      buildSlotPrompt(
        current,
        session.serviceId ? canOfferMore(session, session.serviceId) : false,
        requestMode
      ),
      "slots"
    );
  }

  if (pressed === "9") {
    return fallToCallback(session, shop, "digit");
  }

  return {
    session,
    prompt: {
      say: await menuPromptForSession(session, shop),
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
  await trackBookableEvent({
    businessId: session.businessId,
    sessionId: session.id,
    callId: session.callId,
    event: "voicemail_recorded",
    callStartedAt: session.callStartedAt,
    metadata: { recordingUrl },
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
