import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/appointment-token", () => ({
  verifyAppointmentToken: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  sendCancellationWithWaitlistNotification: vi.fn(),
  sendWaitlistOpeningNotification: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  formatDateTime: vi.fn(() => "Thu, May 21, 9:00 AM"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
    waitlistEntry: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { POST } from "./route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { verifyAppointmentToken } from "@/lib/appointment-token";
import {
  sendCancellationWithWaitlistNotification,
  sendWaitlistOpeningNotification,
} from "@/lib/notifications";

describe("appointments/cancel", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.appointment.findFirst).mockReset();
    vi.mocked(prisma.appointment.findUnique).mockReset();
    vi.mocked(prisma.appointment.update).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.waitlistEntry.findMany).mockReset();
    vi.mocked(prisma.waitlistEntry.update).mockReset();
    vi.mocked(verifyAppointmentToken).mockReset();
    vi.mocked(sendCancellationWithWaitlistNotification).mockReset();
    vi.mocked(sendWaitlistOpeningNotification).mockReset();
  });

  it("rejects invalid cancellation tokens", async () => {
    vi.mocked(verifyAppointmentToken).mockReturnValue(false);

    const response = await POST(
      new Request("http://localhost/api/appointments/cancel", {
        method: "POST",
        body: JSON.stringify({ appointmentId: "appt_1", token: "bad" }),
      }) as never
    );

    expect(response.status).toBe(403);
  });

  it("cancels an appointment, notifies the first waitlist entry, and notifies the owner", async () => {
    vi.mocked(verifyAppointmentToken).mockReturnValue(true);
    vi.mocked(prisma.appointment.findUnique).mockResolvedValue({
      id: "appt_1",
      businessId: "biz_1",
      startTime: new Date("2026-05-21T16:00:00.000Z"),
      serviceName: "Full Groom",
      customerName: "Jamie",
      status: "CONFIRMED",
      business: {
        name: "Paw House",
        phone: "+16195550000",
        phoneNumber: { number: "+16195559999" },
      },
    } as never);
    vi.mocked(prisma.waitlistEntry.findMany).mockResolvedValue([
      {
        id: "wait_1",
        customerName: "Alex",
        customerPhone: "+16195550100",
      },
    ] as never);

    const response = await POST(
      new Request("http://localhost/api/appointments/cancel", {
        method: "POST",
        body: JSON.stringify({ appointmentId: "appt_1", token: "ok" }),
      }) as never
    );
    const payload = await response.json();

    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_1" },
      data: { status: "CANCELLED" },
    });
    expect(prisma.waitlistEntry.update).toHaveBeenCalledWith({
      where: { id: "wait_1" },
      data: {
        status: "NOTIFIED",
        notifiedAt: expect.any(Date),
      },
    });
    expect(sendWaitlistOpeningNotification).toHaveBeenCalledWith(
      {
        name: "Paw House",
        phone: "+16195550000",
        phoneNumber: { number: "+16195559999" },
      },
      {
        id: "wait_1",
        customerName: "Alex",
        customerPhone: "+16195550100",
      },
      "Thu, May 21, 9:00 AM"
    );
    expect(sendCancellationWithWaitlistNotification).toHaveBeenCalledWith(
      {
        name: "Paw House",
        phone: "+16195550000",
        phoneNumber: { number: "+16195559999" },
      },
      expect.objectContaining({ id: "appt_1" }),
      "Alex"
    );
    expect(payload).toEqual({ cancelled: true, waitlistNotified: "Alex" });
  });

  it("requires auth when no token is provided", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);

    const response = await POST(
      new Request("http://localhost/api/appointments/cancel", {
        method: "POST",
        body: JSON.stringify({ appointmentId: "appt_1" }),
      }) as never
    );

    expect(response.status).toBe(401);
  });

  it("returns a stable success response for an already-cancelled appointment", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: "appt_1",
      businessId: "biz_1",
    } as never);
    vi.mocked(prisma.appointment.findUnique).mockResolvedValue({
      id: "appt_1",
      status: "CANCELLED",
      business: {
        phoneNumber: null,
      },
    } as never);

    const req = {
      json: async () => ({ appointmentId: "appt_1" }),
    } as Request;

    const response = await POST(req as never);
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload).toEqual({
      cancelled: true,
      waitlistNotified: null,
    });
    expect(prisma.appointment.update).not.toHaveBeenCalled();
    expect(sendCancellationWithWaitlistNotification).not.toHaveBeenCalled();
  });
});
