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

vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(),
}));

vi.mock("@/lib/utils", () => ({
  formatDateTime: vi.fn(() => "Thu, May 21, 9:00 AM"),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
  },
}));

import { GET, POST } from "./route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { verifyAppointmentToken } from "@/lib/appointment-token";
import { sendSms } from "@/lib/sms";

function makeGetRequest(url: string) {
  const request = new Request(url);
  return Object.assign(request, { nextUrl: new URL(url) });
}

describe("appointments/confirm", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.appointment.findUnique).mockReset();
    vi.mocked(prisma.appointment.findFirst).mockReset();
    vi.mocked(prisma.appointment.update).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(verifyAppointmentToken).mockReset();
    vi.mocked(sendSms).mockReset();
  });

  it("rejects invalid confirmation tokens on GET", async () => {
    vi.mocked(verifyAppointmentToken).mockReturnValue(false);

    const response = await GET(
      makeGetRequest("http://localhost/api/appointments/confirm?id=appt_1&token=bad") as never
    );

    expect(response.status).toBe(403);
  });

  it("confirms pending appointments and notifies the owner on GET", async () => {
    vi.mocked(verifyAppointmentToken).mockReturnValue(true);
    vi.mocked(prisma.appointment.findUnique).mockResolvedValue({
      id: "appt_1",
      customerName: "Jamie",
      serviceName: "Full Groom",
      startTime: new Date("2026-05-21T16:00:00.000Z"),
      status: "PENDING",
      business: {
        name: "Paw House",
        phone: "+16195550000",
        phoneNumber: { number: "+16195559999" },
      },
    } as never);

    const response = await GET(
      makeGetRequest("http://localhost/api/appointments/confirm?id=appt_1&token=ok") as never
    );

    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_1" },
      data: {
        status: "CONFIRMED",
        confirmedAt: expect.any(Date),
      },
    });
    expect(sendSms).toHaveBeenCalledWith(
      "+16195550000",
      "[RingPaw] Jamie confirmed their Full Groom appointment (Thu, May 21, 9:00 AM).",
      "+16195559999"
    );
    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("appointment-confirmed");
  });

  it("requires auth for dashboard POST confirmation without a token", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);

    const response = await POST(
      new Request("http://localhost/api/appointments/confirm", {
        method: "POST",
        body: JSON.stringify({ appointmentId: "appt_1" }),
      }) as never
    );

    expect(response.status).toBe(401);
  });

  it("confirms from the dashboard when the appointment belongs to the business", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({ id: "biz_1" } as never);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({ id: "appt_1" } as never);
    vi.mocked(prisma.appointment.findUnique).mockResolvedValue({
      id: "appt_1",
      status: "PENDING",
    } as never);
    vi.mocked(prisma.appointment.update).mockResolvedValue({
      id: "appt_1",
      status: "CONFIRMED",
    } as never);

    const response = await POST(
      new Request("http://localhost/api/appointments/confirm", {
        method: "POST",
        body: JSON.stringify({ appointmentId: "appt_1" }),
      }) as never
    );
    const payload = await response.json();

    expect(payload.appointment).toEqual({ id: "appt_1", status: "CONFIRMED" });
  });

  it("does not reconfirm a cancelled appointment", async () => {
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
    } as never);

    const req = {
      json: async () => ({ appointmentId: "appt_1" }),
    } as Request;

    const response = await POST(req as never);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("This appointment was already cancelled");
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });
});
