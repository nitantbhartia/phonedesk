import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
    },
    call: {
      findMany: vi.fn(),
    },
    appointment: {
      findMany: vi.fn(),
    },
    customer: {
      count: vi.fn(),
    },
  },
}));

vi.mock("@/lib/email", () => ({
  sendEmail: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";
import { POST } from "./route";

describe("POST /api/digest/weekly", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.call.findMany).mockReset();
    vi.mocked(prisma.appointment.findMany).mockReset();
    vi.mocked(prisma.customer.count).mockReset();
    vi.mocked(sendEmail).mockReset();
  });

  it("returns unauthorized without a session email", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);

    const response = await POST(
      new Request("http://localhost/api/digest/weekly", { method: "POST" }) as never
    );

    expect(response.status).toBe(401);
  });

  it("uses a zero average duration when calls exist but none have duration yet", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      business: {
        id: "biz_1",
        name: "Paw House",
        ownerName: "Taylor",
        email: null,
        services: [],
        phoneNumber: null,
      },
    } as never);
    vi.mocked(prisma.call.findMany).mockResolvedValue([
      {
        status: "COMPLETED",
        duration: null,
        appointmentId: "appt_1",
        summary: "Booked a bath",
        extractedData: { service_name: "Bath" },
        callerName: "Jamie",
      },
    ] as never);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([] as never);
    vi.mocked(prisma.customer.count).mockResolvedValue(0);

    const response = await POST(
      new Request("http://localhost/api/digest/weekly", { method: "POST" }) as never
    );

    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        text: expect.stringContaining("Avg call length: —"),
      })
    );
  });

  it("derives top service and revenue from booked appointments and active services", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com" },
    } as never);
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      business: {
        id: "biz_1",
        name: "Paw House",
        ownerName: "Taylor",
        email: "shop@example.com",
        services: [
          { name: "Bath", price: 45 },
          { name: "Full Groom", price: 90 },
        ],
        phoneNumber: null,
      },
    } as never);
    vi.mocked(prisma.call.findMany).mockResolvedValue([
      {
        status: "COMPLETED",
        duration: 120,
        appointmentId: "appt_1",
        summary: "Booked a bath",
        extractedData: {},
        callerName: "Jamie",
      },
    ] as never);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      { status: "CONFIRMED", serviceName: "Bath", startTime: new Date().toISOString() },
      { status: "COMPLETED", serviceName: "Bath", startTime: new Date().toISOString() },
      { status: "PENDING", serviceName: "Full Groom", startTime: new Date().toISOString() },
    ] as never);
    vi.mocked(prisma.customer.count).mockResolvedValue(0);

    const response = await POST(
      new Request("http://localhost/api/digest/weekly", { method: "POST" }) as never
    );

    expect(response.status).toBe(200);
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "shop@example.com",
        text: expect.stringContaining("Revenue protected: $180 est."),
      })
    );
    expect(sendEmail).toHaveBeenCalledWith(
      expect.objectContaining({
        text: expect.stringContaining("Most requested service: Bath"),
      })
    );
  });
});
