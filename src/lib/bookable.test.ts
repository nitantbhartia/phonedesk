import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
    customer: { findUnique: vi.fn() },
    bookableSession: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    calendarConnection: { findFirst: vi.fn() },
    appointment: { update: vi.fn() },
    call: { update: vi.fn() },
  },
}));

vi.mock("@/lib/calendar", () => ({
  getNextOpenSlots: vi.fn(),
  isSlotAvailable: vi.fn(),
  bookAppointment: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  sendBookableCallbackToOwner: vi.fn(async () => "sent"),
  sendBookableConfirmationToCustomer: vi.fn(async () => "sent"),
  sendBookableOwnerBookingNotice: vi.fn(async () => "sent"),
  sendBookableRequestToOwner: vi.fn(async () => "sent"),
}));

import { prisma } from "@/lib/prisma";
import { bookAppointment, getNextOpenSlots, isSlotAvailable } from "@/lib/calendar";
import { sendBookableConfirmationToCustomer } from "@/lib/notifications";
import {
  BANNED_VOICE_COPY,
  buildBookedPrompt,
  buildCallbackPrompt,
  buildMenuPrompt,
  buildServicePrompt,
  buildSlotPrompt,
  formatSpokenSlot,
  handleBookableDigit,
  phoneBookableServices,
  resolveInboundPath,
  startBookableCall,
} from "./bookable";

const shop = {
  id: "biz_1",
  name: "Spawkles",
  timezone: "America/Los_Angeles",
  phone: "+16195550000",
  inboundPath: "BOOKABLE_VOICEMAIL",
  phoneNumber: { number: "+16195559999" },
  services: [
    { id: "svc_bath", name: "Bath", duration: 60, price: 45, isActive: true, isAddon: false },
    { id: "svc_groom", name: "Full Groom", duration: 90, price: 85, isActive: true, isAddon: false },
  ],
};

const slotA = {
  start: "2026-03-17T21:00:00.000Z",
  end: "2026-03-17T22:00:00.000Z",
  spoken: "Tue 2pm",
};
const slotB = {
  start: "2026-03-18T17:00:00.000Z",
  end: "2026-03-18T18:00:00.000Z",
  spoken: "Wed 10am",
};
const slotC = {
  start: "2026-03-19T19:00:00.000Z",
  end: "2026-03-19T20:00:00.000Z",
  spoken: "Thu 12pm",
};
const slotD = {
  start: "2026-03-20T18:00:00.000Z",
  end: "2026-03-20T19:00:00.000Z",
  spoken: "Fri 11am",
};

function session(overrides: Record<string, unknown> = {}) {
  return {
    id: "sess_1",
    businessId: "biz_1",
    callSid: "CA123",
    callerPhone: "+16195550100",
    state: "menu",
    status: "IN_PROGRESS",
    slotOffset: 0,
    slotsHeard: 0,
    slotsOffered: null,
    prefetchedSlots: {
      svc_bath: [slotA, slotB, slotC, slotD],
      svc_groom: [slotA, slotB, slotC, slotD],
    },
    knownCaller: false,
    appointmentId: null,
    calendarEventId: null,
    bookingKind: null,
    serviceId: null,
    ...overrides,
  };
}

describe("bookable copy", () => {
  it("never claims an AI receptionist", () => {
    const lines = [
      buildMenuPrompt("Spawkles"),
      buildServicePrompt(shop.services as never),
      buildSlotPrompt([slotA, slotB], true),
      buildBookedPrompt("Bath", "Tue 2pm", "AUTO"),
      buildBookedPrompt("Bath", "Tue 2pm", "REQUEST"),
      buildCallbackPrompt(),
    ];
    for (const line of lines) {
      expect(line).not.toMatch(BANNED_VOICE_COPY);
    }
    expect(buildMenuPrompt("Spawkles")).toContain("To book, press 1");
    expect(buildMenuPrompt("Spawkles")).toContain("press 9");
    expect(buildMenuPrompt("Spawkles")).not.toContain("press 2");
  });

  it("speaks short shop-first slot labels", () => {
    expect(formatSpokenSlot(new Date("2026-03-17T21:00:00.000Z"), "America/Los_Angeles")).toMatch(/Tue/i);
    expect(phoneBookableServices(shop.services as never)).toHaveLength(2);
  });
});

describe("resolveInboundPath", () => {
  it("defaults to bookable voicemail", () => {
    expect(resolveInboundPath({})).toBe("BOOKABLE_VOICEMAIL");
  });
});

describe("startBookableCall", () => {
  beforeEach(() => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue(shop as never);
    vi.mocked(prisma.customer.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.bookableSession.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.bookableSession.create).mockImplementation(async ({ data }) => ({
      id: "sess_1",
      ...data,
    }) as never);
    vi.mocked(getNextOpenSlots).mockResolvedValue([
      { start: new Date(slotA.start), end: new Date(slotA.end) },
      { start: new Date(slotB.start), end: new Date(slotB.end) },
    ]);
  });

  it("prefetches slots and opens on the two-choice menu", async () => {
    const result = await startBookableCall({
      businessId: "biz_1",
      callSid: "CA123",
      callerPhone: "+16195550100",
    });

    expect(result.prompt.state).toBe("menu");
    expect(result.prompt.say).toContain("Spawkles");
    expect(getNextOpenSlots).toHaveBeenCalled();
    expect(prisma.bookableSession.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        callSid: "CA123",
        knownCaller: false,
      }),
    });
  });
});

describe("DTMF tree", () => {
  beforeEach(() => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue(shop as never);
    vi.mocked(prisma.bookableSession.update).mockImplementation(async ({ data }) => ({
      ...session(),
      ...data,
    }) as never);
    vi.mocked(prisma.customer.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue({
      provider: "GOOGLE",
      isPrimary: true,
      accessToken: "token",
    } as never);
    vi.mocked(isSlotAvailable).mockResolvedValue(true);
    vi.mocked(bookAppointment).mockResolvedValue({
      id: "appt_1",
      customerName: "Caller",
      customerPhone: "+16195550100",
      serviceName: "Bath",
      startTime: new Date(slotA.start),
      calendarEventId: "google_evt",
      status: "PENDING",
    } as never);
  });

  it("press 1 then service then two prefetched slots", async () => {
    const afterMenu = await handleBookableDigit(session(), "1");
    expect(afterMenu.prompt.state).toBe("service");
    expect(afterMenu.prompt.say).toContain("Bath");
    expect(afterMenu.prompt.say).toContain("Full Groom");

    const afterService = await handleBookableDigit(
      session({ state: "service" }),
      "1"
    );
    expect(afterService.prompt.state).toBe("slots");
    expect(afterService.prompt.say).toContain("press 1");
    expect(afterService.prompt.say).toContain("press 2");
    expect(afterService.prompt.say).toContain("More times, press 3");
  });

  it("press 3 offers two more slots and then falls to callback after six", async () => {
    const more = await handleBookableDigit(
      session({
        state: "slots",
        serviceId: "svc_bath",
        slotOffset: 0,
        slotsHeard: 2,
        slotsOffered: [slotA, slotB],
      }),
      "3"
    );
    expect(more.prompt.state).toBe("slots");
    expect(more.prompt.slots?.map((slot) => slot.spoken)).toEqual(["Thu 12pm", "Fri 11am"]);

    const done = await handleBookableDigit(
      session({
        state: "slots",
        serviceId: "svc_bath",
        slotOffset: 4,
        slotsHeard: 6,
        slotsOffered: [slotC, slotD],
      }),
      "3"
    );
    expect(done.prompt.record).toBe(true);
    expect(done.prompt.state).toBe("callback");
  });

  it("revalidates then writes a request booking for unknown callers", async () => {
    const result = await handleBookableDigit(
      session({
        state: "slots",
        serviceId: "svc_bath",
        slotsOffered: [slotA, slotB],
        knownCaller: false,
      }),
      "1"
    );

    expect(isSlotAvailable).toHaveBeenCalled();
    expect(bookAppointment).toHaveBeenCalledWith(
      "biz_1",
      expect.objectContaining({
        serviceName: "Bath",
        bookingModeOverride: "SOFT",
      })
    );
    expect(sendBookableConfirmationToCustomer).toHaveBeenCalled();
    expect(result.prompt.state).toBe("booked");
    expect(result.prompt.say).toContain("requested");
  });

  it("auto-books a known caller after a successful calendar write", async () => {
    vi.mocked(prisma.customer.findUnique).mockResolvedValue({ name: "Jamie" } as never);
    vi.mocked(bookAppointment).mockResolvedValue({
      id: "appt_2",
      customerName: "Jamie",
      customerPhone: "+16195550100",
      serviceName: "Bath",
      startTime: new Date(slotA.start),
      calendarEventId: "google_evt",
      status: "CONFIRMED",
    } as never);

    const result = await handleBookableDigit(
      session({
        state: "slots",
        serviceId: "svc_bath",
        slotsOffered: [slotA, slotB],
        knownCaller: true,
      }),
      "1"
    );

    expect(bookAppointment).toHaveBeenCalledWith(
      "biz_1",
      expect.objectContaining({ bookingModeOverride: "HARD", customerName: "Jamie" })
    );
    expect(result.prompt.say).toContain("You're booked");
  });

  it("does not double-book the same digit after a successful write", async () => {
    const first = session({
      state: "booked",
      status: "REQUESTED",
      serviceId: "svc_bath",
      appointmentId: "appt_1",
      bookingKind: "REQUEST",
      slotsOffered: [slotA],
    });
    const again = await handleBookableDigit(first, "1");
    expect(bookAppointment).not.toHaveBeenCalled();
    expect(again.prompt.appointmentId).toBe("appt_1");
  });

  it("offers the next slot when the first is taken, and falls to callback when calendar write fails", async () => {
    vi.mocked(isSlotAvailable)
      .mockResolvedValueOnce(false)
      .mockResolvedValueOnce(true)
      .mockResolvedValueOnce(true);

    await handleBookableDigit(
      session({
        state: "slots",
        serviceId: "svc_bath",
        slotsOffered: [slotA, slotB],
        prefetchedSlots: { svc_bath: [slotA, slotB] },
      }),
      "1"
    );
    expect(bookAppointment).toHaveBeenCalledWith(
      "biz_1",
      expect.objectContaining({ startTime: new Date(slotB.start) })
    );

    vi.mocked(bookAppointment).mockResolvedValue({
      id: "appt_fail",
      calendarEventId: null,
    } as never);
    const failed = await handleBookableDigit(
      session({
        state: "slots",
        serviceId: "svc_bath",
        slotsOffered: [slotA, slotB],
      }),
      "1"
    );
    expect(failed.prompt.state).toBe("callback");
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_fail" },
      data: expect.objectContaining({ status: "CANCELLED" }),
    });
  });

  it("press 9 notifies the shop and records a callback", async () => {
    const result = await handleBookableDigit(session(), "9");
    expect(result.prompt.record).toBe(true);
    expect(result.prompt.say).toContain("call you back");
  });
});
