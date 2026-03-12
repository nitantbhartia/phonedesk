import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: {
      findFirst: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
    appointment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    demoSession: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/retell-auth", () => ({
  isRetellWebhookValid: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  sendCancellationWithWaitlistNotification: vi.fn(),
}));

vi.mock("@/lib/demo-session", () => ({
  resolveBusinessFromDemo: vi.fn(),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { sendCancellationWithWaitlistNotification } from "@/lib/notifications";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/retell/cancel-appointment", {
    method: "POST",
    headers: { "content-type": "application/json", "x-retell-signature": "sig" },
    body: JSON.stringify(body),
  });
}

const businessRecord = {
  id: "biz_1",
  name: "Paw House",
  ownerName: "Jordan",
  phone: "+16195550000",
  timezone: "America/Los_Angeles",
  phoneNumber: { number: "+16195559999" },
};

const upcomingAppointment = {
  id: "appt_1",
  customerName: "Jamie",
  customerPhone: "+16195550100",
  petName: "Buddy",
  serviceName: "Full Groom",
  status: "CONFIRMED",
  startTime: new Date("2026-05-21T16:00:00Z"),
};

describe("POST /api/retell/cancel-appointment", () => {
  beforeEach(() => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(true);
    vi.mocked(prisma.phoneNumber.findFirst).mockReset();
    vi.mocked(prisma.appointment.findFirst).mockReset();
    vi.mocked(prisma.appointment.update).mockReset();
    vi.mocked(sendCancellationWithWaitlistNotification).mockReset();

    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: businessRecord,
    } as never);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(
      upcomingAppointment as never
    );
    vi.mocked(prisma.appointment.update).mockResolvedValue({
      ...upcomingAppointment,
      status: "CANCELLED",
    } as never);
    vi.mocked(sendCancellationWithWaitlistNotification).mockResolvedValue(
      undefined
    );
  });

  it("rejects unauthorized requests", async () => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(false);

    const res = await POST(
      makeRequest({ args: {}, call: { to_number: "+16195559999", from_number: "+16195550100" } }) as never
    );

    expect(res.status).toBe(401);
  });

  it("cancels the upcoming appointment found by caller phone", async () => {
    const res = await POST(
      makeRequest({
        args: {},
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await res.json();

    expect(payload.cancelled).toBe(true);
    expect(payload.appointment_id).toBe("appt_1");
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_1" },
      data: { status: "CANCELLED" },
    });
    expect(payload.result).toContain("Buddy");
    expect(payload.result).toContain("Full Groom");
    expect(payload.result).toContain("Jordan");
  });

  it("notifies the owner after cancellation", async () => {
    await POST(
      makeRequest({
        args: {},
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );

    expect(sendCancellationWithWaitlistNotification).toHaveBeenCalledWith(
      expect.objectContaining({ id: "biz_1" }),
      upcomingAppointment
    );
  });

  it("returns cancelled=false when no upcoming appointment is found", async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null);

    const res = await POST(
      makeRequest({
        args: {},
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await res.json();

    expect(payload.cancelled).toBe(false);
    expect(prisma.appointment.update).not.toHaveBeenCalled();
    expect(payload.result).toContain("couldn't find");
  });

  it("falls back to customer_name lookup when caller phone is absent", async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(
      upcomingAppointment as never
    );

    const res = await POST(
      makeRequest({
        args: { customer_name: "Jamie" },
        call: { to_number: "+16195559999" }, // no from_number
      }) as never
    );
    const payload = await res.json();

    expect(payload.cancelled).toBe(true);
    expect(prisma.appointment.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          customerName: expect.objectContaining({ contains: "Jamie" }),
        }),
      })
    );
  });

  it("returns gracefully when business cannot be resolved", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);

    const res = await POST(
      makeRequest({
        args: {},
        call: { to_number: "+19999999999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await res.json();

    expect(payload.cancelled).toBe(false);
    expect(payload.result).toContain("booking system");
  });

  it("still returns cancelled=true even if owner notification fails", async () => {
    vi.mocked(sendCancellationWithWaitlistNotification).mockRejectedValue(
      new Error("SMS down")
    );

    const res = await POST(
      makeRequest({
        args: {},
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await res.json();

    expect(payload.cancelled).toBe(true);
  });
});
