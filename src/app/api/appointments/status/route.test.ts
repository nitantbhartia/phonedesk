import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(),
}));

import { POST } from "./route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";

describe("appointments/status", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.appointment.findUnique).mockReset();
    vi.mocked(prisma.appointment.update).mockReset();
    vi.mocked(sendSms).mockReset();
  });

  it("requires auth", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);

    const response = await POST(
      new Request("http://localhost/api/appointments/status", {
        method: "POST",
        body: JSON.stringify({ appointmentId: "appt_1", status: "CHECKED_IN" }),
      }) as never
    );

    expect(response.status).toBe(401);
  });

  it("rejects invalid grooming statuses", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);

    const response = await POST(
      new Request("http://localhost/api/appointments/status", {
        method: "POST",
        body: JSON.stringify({ appointmentId: "appt_1", status: "NOPE" }),
      }) as never
    );

    expect(response.status).toBe(400);
  });

  it("marks appointments completed on PICKED_UP and notifies the customer", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.appointment.findUnique).mockResolvedValue({
      id: "appt_1",
      status: "CONFIRMED",
      groomingStatus: "READY_FOR_PICKUP",
      petName: "Buddy",
      customerPhone: "+16195550100",
      business: {
        userId: "user_1",
        name: "Paw House",
        address: "123 Main St",
        phoneNumber: { number: "+16195559999" },
      },
    } as never);

    const response = await POST(
      new Request("http://localhost/api/appointments/status", {
        method: "POST",
        body: JSON.stringify({ appointmentId: "appt_1", status: "PICKED_UP" }),
      }) as never
    );
    const payload = await response.json();

    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_1" },
      data: {
        groomingStatus: "PICKED_UP",
        groomingStatusAt: expect.any(Date),
        completedAt: expect.any(Date),
        status: "COMPLETED",
      },
    });
    expect(sendSms).toHaveBeenCalledWith(
      "+16195550100",
      "Thanks for picking up Buddy! Hope they feel great. See you next time!",
      "+16195559999"
    );
    expect(payload).toEqual({ ok: true, status: "PICKED_UP" });
  });

  it("rejects invalid grooming transitions for cancelled appointments", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.appointment.findUnique).mockResolvedValue({
      id: "appt_1",
      status: "CANCELLED",
      groomingStatus: null,
      petName: "Buddy",
      customerPhone: "+16195550100",
      business: {
        userId: "user_1",
        name: "Paw House",
        address: "123 Main St",
        phoneNumber: { number: "+16195559999" },
      },
    } as never);

    const response = await POST(
      new Request("http://localhost/api/appointments/status", {
        method: "POST",
        body: JSON.stringify({ appointmentId: "appt_1", status: "CHECKED_IN" }),
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toContain("not allowed");
    expect(prisma.appointment.update).not.toHaveBeenCalled();
    expect(sendSms).not.toHaveBeenCalled();
  });
});
