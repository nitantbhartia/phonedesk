import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    smsLog: {
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    phoneNumber: {
      findFirst: vi.fn(),
    },
    appointment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    waitlistEntry: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/sms-commands", () => ({
  parseOwnerCommand: vi.fn(),
  executeCommand: vi.fn(),
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/retell-auth", () => ({
  isRetellAuthorized: vi.fn(),
}));

vi.mock("@/lib/sms", () => ({
  isSmsEnabled: vi.fn(() => true),
}));

vi.mock("@/lib/retell", () => ({
  sendSms: vi.fn(),
}));

vi.mock("@/lib/calendar", () => ({
  bookAppointment: vi.fn(),
  isSlotAvailable: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  formatDateTime: vi.fn(() => "Thu, May 21, 9:00 AM"),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { parseOwnerCommand, executeCommand } from "@/lib/sms-commands";
import { rateLimit } from "@/lib/rate-limit";
import { isRetellAuthorized } from "@/lib/retell-auth";
import { isSmsEnabled } from "@/lib/sms";
import { sendSms } from "@/lib/retell";
import { bookAppointment, isSlotAvailable } from "@/lib/calendar";

function makeJsonRequest(body: unknown) {
  return new Request("http://localhost/api/sms/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function makeTwilioRequest(body: URLSearchParams, signature?: string) {
  return new Request("http://localhost/api/sms/webhook", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      ...(signature ? { "x-twilio-signature": signature } : {}),
    },
    body,
  });
}

describe("POST /api/sms/webhook", () => {
  beforeEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_PHONE_NUMBER;

    vi.mocked(isSmsEnabled).mockReturnValue(true);
    vi.mocked(isRetellAuthorized).mockReturnValue(true);
    vi.mocked(rateLimit).mockReturnValue({ allowed: true } as never);
    vi.mocked(prisma.smsLog.create).mockReset();
    vi.mocked(prisma.smsLog.updateMany).mockReset();
    vi.mocked(prisma.phoneNumber.findFirst).mockReset();
    vi.mocked(prisma.appointment.findFirst).mockReset();
    vi.mocked(prisma.appointment.update).mockReset();
    vi.mocked(prisma.waitlistEntry.findFirst).mockReset();
    vi.mocked(prisma.waitlistEntry.update).mockReset();
    vi.mocked(parseOwnerCommand).mockReset();
    vi.mocked(executeCommand).mockReset();
    vi.mocked(sendSms).mockReset();
    vi.mocked(bookAppointment).mockReset();
    vi.mocked(isSlotAvailable).mockReset();

    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: {
        id: "biz_1",
        name: "Paw House",
        phone: "+16195550000",
        address: "123 Bark St",
      },
    } as never);
  });

  it("rejects unauthorized retell webhook requests", async () => {
    vi.mocked(isRetellAuthorized).mockReturnValue(false);

    const response = await POST(
      makeJsonRequest({
        from_number: "+16195550100",
        to_number: "+16195559999",
        message: "STATUS",
      }) as never
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns a no-op response immediately when sms is disabled", async () => {
    vi.mocked(isSmsEnabled).mockReturnValue(false);
    vi.mocked(isRetellAuthorized).mockReturnValue(false);

    const response = await POST(
      makeJsonRequest({
        from_number: "+16195550100",
        to_number: "+16195559999",
        message: "STATUS",
      }) as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(prisma.smsLog.create).not.toHaveBeenCalled();
  });

  it("parses and executes owner commands when the owner texts from the business phone", async () => {
    vi.mocked(parseOwnerCommand).mockResolvedValue({
      intent: "pause_bookings",
      entities: {},
    });
    vi.mocked(executeCommand).mockResolvedValue("Bookings paused.");

    const response = await POST(
      makeJsonRequest({
        from_number: "+16195550000",
        to_number: "+16195559999",
        message: "Pause bookings",
      }) as never
    );

    expect(response.status).toBe(200);
    expect(prisma.smsLog.create).toHaveBeenCalledWith({
      data: {
        direction: "INBOUND",
        fromNumber: "+16195550000",
        toNumber: "+16195559999",
        body: "Pause bookings",
      },
    });
    expect(prisma.smsLog.updateMany).toHaveBeenCalledWith({
      where: {
        fromNumber: "+16195550000",
        toNumber: "+16195559999",
        body: "Pause bookings",
      },
      data: { intent: "pause_bookings", businessId: "biz_1" },
    });
    expect(executeCommand).toHaveBeenCalledWith(
      "biz_1",
      { intent: "pause_bookings", entities: {} },
      "+16195550000",
      "+16195559999"
    );
    await expect(response.json()).resolves.toEqual({ ok: true });
  });

  it("cancels the next upcoming appointment and notifies both customer and owner", async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: "appt_1",
      customerName: "Jamie",
      serviceName: "Full Groom",
    } as never);

    const response = await POST(
      makeJsonRequest({
        from_number: "+16195550100",
        to_number: "+16195559999",
        message: "CANCEL",
      }) as never
    );

    expect(response.status).toBe(200);
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_1" },
      data: { status: "CANCELLED" },
    });
    expect(sendSms).toHaveBeenNthCalledWith(
      1,
      "+16195550100",
      "Your appointment at Paw House has been cancelled. Call us to reschedule!",
      "+16195559999"
    );
    expect(sendSms).toHaveBeenNthCalledWith(
      2,
      "+16195550000",
      "[RingPaw] Jamie cancelled their Full Groom appointment.",
      "+16195559999"
    );
  });

  it("returns the generic help menu for unsupported customer messages", async () => {
    const response = await POST(
      makeJsonRequest({
        from_number: "+16195550100",
        to_number: "+16195559999",
        message: "hello there",
      }) as never
    );

    expect(response.status).toBe(200);
    expect(sendSms).toHaveBeenCalledWith(
      "+16195550100",
      expect.stringContaining("STATUS - Check on your pet"),
      "+16195559999"
    );
  });

  it("confirms the next appointment and notifies the owner", async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: "appt_1",
      customerName: "Jamie",
      serviceName: "Full Groom",
      startTime: new Date("2026-05-21T16:00:00.000Z"),
    } as never);

    const response = await POST(
      makeJsonRequest({
        from_number: "+16195550100",
        to_number: "+16195559999",
        message: "CONFIRM",
      }) as never
    );

    expect(response.status).toBe(200);
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_1" },
      data: {
        status: "CONFIRMED",
        confirmedAt: expect.any(Date),
      },
    });
    expect(sendSms).toHaveBeenNthCalledWith(
      1,
      "+16195550100",
      "Your appointment at Paw House is confirmed! See you soon. 🐾",
      "+16195559999"
    );
    expect(sendSms).toHaveBeenNthCalledWith(
      2,
      "+16195550000",
      "[RingPaw] Jamie confirmed their Full Groom appointment (Thu, May 21, 9:00 AM).",
      "+16195559999"
    );
  });

  it("books a notified waitlist customer when the slot is still open", async () => {
    vi.mocked(prisma.waitlistEntry.findFirst).mockResolvedValue({
      id: "wait_1",
      customerName: "Jamie",
      customerPhone: "+16195550100",
      petName: "Bella",
      petBreed: "Poodle",
      petSize: "SMALL",
      serviceName: "Bath",
      preferredDate: new Date("2026-05-21T16:00:00.000Z"),
    } as never);
    vi.mocked(isSlotAvailable).mockResolvedValue(true);

    const response = await POST(
      makeJsonRequest({
        from_number: "+16195550100",
        to_number: "+16195559999",
        message: "BOOK",
      }) as never
    );

    expect(response.status).toBe(200);
    expect(bookAppointment).toHaveBeenCalledWith(
      "biz_1",
      expect.objectContaining({
        customerName: "Jamie",
        petName: "Bella",
        serviceName: "Bath",
      })
    );
    expect(prisma.waitlistEntry.update).toHaveBeenCalledWith({
      where: { id: "wait_1" },
      data: { status: "BOOKED", bookedAt: expect.any(Date) },
    });
    expect(sendSms).toHaveBeenCalledWith(
      "+16195550100",
      expect.stringContaining("Great — you're booked!"),
      "+16195559999"
    );
  });

  it("shares live grooming status for today's appointment", async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: "appt_today",
      petName: "Bella",
      groomingStatus: "READY_FOR_PICKUP",
      startTime: new Date("2026-05-21T16:00:00.000Z"),
    } as never);

    const response = await POST(
      makeJsonRequest({
        from_number: "+16195550100",
        to_number: "+16195559999",
        message: "STATUS",
      }) as never
    );

    expect(response.status).toBe(200);
    expect(sendSms).toHaveBeenCalledWith(
      "+16195550100",
      "Bella is ready for pickup! Head to 123 Bark St.",
      "+16195559999"
    );
  });

  it("handles owner command parsing failures with a fallback reply", async () => {
    vi.mocked(parseOwnerCommand).mockRejectedValue(new Error("bad parse"));

    const response = await POST(
      makeJsonRequest({
        from_number: "+16195550000",
        to_number: "+16195559999",
        message: "pause pls",
      }) as never
    );

    expect(response.status).toBe(200);
    expect(sendSms).toHaveBeenCalledWith(
      "+16195550000",
      "[RingPaw] Sorry, I had trouble processing that. Try again or text 'help' for available commands.",
      "+16195559999"
    );
  });

  it("returns a no-op response when rate limited", async () => {
    vi.mocked(rateLimit).mockReturnValue({ allowed: false } as never);

    const response = await POST(
      makeJsonRequest({
        from_number: "+16195550100",
        to_number: "+16195559999",
        message: "STATUS",
      }) as never
    );

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ ok: true });
    expect(prisma.smsLog.create).not.toHaveBeenCalled();
  });

  it("returns empty TwiML for invalid Twilio signatures", async () => {
    process.env.TWILIO_AUTH_TOKEN = "twilio-secret";

    const response = await POST(
      makeTwilioRequest(
        new URLSearchParams({
          From: "+16195550100",
          To: "+16195559999",
          Body: "STATUS",
        }),
        "bad-signature"
      ) as never
    );

    expect(response.status).toBe(200);
    await expect(response.text()).resolves.toContain("<Response></Response>");
  });

  it("tells the customer when a waitlist slot was already taken", async () => {
    vi.mocked(prisma.waitlistEntry.findFirst).mockResolvedValue({
      id: "wait_1",
      preferredDate: new Date("2026-05-21T16:00:00.000Z"),
      customerName: "Jamie",
      customerPhone: "+16195550100",
    } as never);
    vi.mocked(isSlotAvailable).mockResolvedValue(false);

    const response = await POST(
      makeJsonRequest({
        from_number: "+16195550100",
        to_number: "+16195559999",
        message: "BOOK",
      }) as never
    );

    expect(response.status).toBe(200);
    expect(sendSms).toHaveBeenCalledWith(
      "+16195550100",
      "Sorry, that slot was just taken. We'll let you know when the next opening comes up!",
      "+16195559999"
    );
    expect(bookAppointment).not.toHaveBeenCalled();
  });

  it("offers a rebooking nudge based on the last completed appointment", async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      petName: "Bella",
    } as never);

    const response = await POST(
      makeJsonRequest({
        from_number: "+16195550100",
        to_number: "+16195559999",
        message: "REBOOK",
      }) as never
    );

    expect(response.status).toBe(200);
    expect(sendSms).toHaveBeenCalledWith(
      "+16195550100",
      expect.stringContaining("we'll get Bella scheduled"),
      "+16195559999"
    );
  });
});
