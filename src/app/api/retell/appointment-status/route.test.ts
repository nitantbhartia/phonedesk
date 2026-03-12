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
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/retell-auth", () => ({
  isRetellWebhookValid: vi.fn(),
}));

vi.mock("@/lib/demo-session", () => ({
  resolveBusinessFromDemo: vi.fn(),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { isRetellWebhookValid } from "@/lib/retell-auth";

const businessRecord = {
  id: "biz_1",
  name: "Paw House",
  ownerName: "Jordan",
  address: "123 Main St",
  timezone: "America/Los_Angeles",
  phoneNumber: { number: "+16195559999" },
  services: [],
};

const readyAppointment = {
  id: "appt_1",
  businessId: "biz_1",
  customerName: "Jamie",
  customerPhone: "+16195550100",
  petName: "Buddy",
  serviceName: "Full Groom",
  startTime: new Date("2026-05-21T16:00:00Z"),
  status: "CONFIRMED",
  groomingStatus: "READY_FOR_PICKUP",
};

const secondAppointment = {
  ...readyAppointment,
  id: "appt_2",
  petName: "Bella",
  groomingStatus: null,
  startTime: new Date("2026-05-21T18:00:00Z"),
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/retell/appointment-status", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-retell-signature": "sig",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/retell/appointment-status", () => {
  beforeEach(() => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(true);
    vi.mocked(prisma.phoneNumber.findFirst).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.appointment.findFirst).mockReset();
    vi.mocked(prisma.appointment.findMany).mockReset();

    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: businessRecord,
    } as never);
  });

  it("rejects unauthorized requests", async () => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(false);

    const response = await POST(makeRequest({ args: {}, call: {} }) as never);

    expect(response.status).toBe(401);
  });

  it("returns the live pickup status for a single appointment", async () => {
    vi.mocked(prisma.appointment.findMany)
      .mockResolvedValueOnce([readyAppointment] as never)
      .mockResolvedValueOnce([] as never);

    const response = await POST(
      makeRequest({
        args: {},
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.found).toBe(true);
    expect(payload.status).toBe("READY_FOR_PICKUP");
    expect(payload.result).toContain("ready for pickup");
    expect(payload.result).toContain("123 Main St");
  });

  it("returns appointment options when multiple pets are on today's schedule", async () => {
    const scheduledBuddy = {
      ...readyAppointment,
      groomingStatus: null,
    };

    vi.mocked(prisma.appointment.findMany)
      .mockResolvedValueOnce([scheduledBuddy, secondAppointment] as never)
      .mockResolvedValueOnce([] as never);

    const response = await POST(
      makeRequest({
        args: {},
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.found).toBe(true);
    expect(payload.multiple_appointments).toHaveLength(2);
    expect(payload.result).toContain("Which pet");
  });
});
