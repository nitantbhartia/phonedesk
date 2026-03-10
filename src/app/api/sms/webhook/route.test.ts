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

vi.mock("@/lib/retell", () => ({
  sendSms: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  formatDateTime: vi.fn(() => "Thu, May 21, 9:00 AM"),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { parseOwnerCommand, executeCommand } from "@/lib/sms-commands";
import { rateLimit } from "@/lib/rate-limit";
import { isRetellAuthorized } from "@/lib/retell-auth";
import { sendSms } from "@/lib/retell";

function makeJsonRequest(body: unknown) {
  return new Request("http://localhost/api/sms/webhook", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/sms/webhook", () => {
  beforeEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_PHONE_NUMBER;

    vi.mocked(isRetellAuthorized).mockReturnValue(true);
    vi.mocked(rateLimit).mockReturnValue({ allowed: true } as never);
    vi.mocked(prisma.smsLog.create).mockReset();
    vi.mocked(prisma.smsLog.updateMany).mockReset();
    vi.mocked(prisma.phoneNumber.findFirst).mockReset();
    vi.mocked(prisma.appointment.findFirst).mockReset();
    vi.mocked(prisma.appointment.update).mockReset();
    vi.mocked(parseOwnerCommand).mockReset();
    vi.mocked(executeCommand).mockReset();
    vi.mocked(sendSms).mockReset();

    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: {
        id: "biz_1",
        name: "Paw House",
        phone: "+16195550000",
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
});
