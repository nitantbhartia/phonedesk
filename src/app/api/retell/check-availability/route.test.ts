import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: {
      findFirst: vi.fn(),
    },
    demoSession: {
      findFirst: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/calendar", () => ({
  describeAvailableSlots: vi.fn(),
  getAvailableSlots: vi.fn(),
}));

vi.mock("@/lib/retell-auth", () => ({
  isRetellWebhookValid: vi.fn(),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { describeAvailableSlots, getAvailableSlots } from "@/lib/calendar";
import { isRetellWebhookValid } from "@/lib/retell-auth";

function makeRequest(body: unknown, signature = "sig") {
  return new Request("http://localhost/api/retell/check-availability", {
    method: "POST",
    headers: { "content-type": "application/json", "x-retell-signature": signature },
    body: JSON.stringify(body),
  });
}

describe("POST /api/retell/check-availability", () => {
  beforeEach(() => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(true);
    vi.mocked(prisma.phoneNumber.findFirst).mockReset();
    vi.mocked(prisma.demoSession.findFirst).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(getAvailableSlots).mockReset();
    vi.mocked(describeAvailableSlots).mockReset();
  });

  it("rejects unauthorized requests", async () => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(false);

    const response = await POST(makeRequest({ args: {}, call: {} }) as never);

    expect(response.status).toBe(401);
  });

  it("returns a fallback message when the business cannot be resolved", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);

    const response = await POST(
      makeRequest({
        args: { date: "2026-05-21" },
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.result).toContain("having trouble accessing the system");
  });

  it("confirms the requested slot when the preferred time is available", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: {
        id: "biz_1",
        timezone: "America/Los_Angeles",
        services: [{ name: "Full Groom", duration: 90, isActive: true }],
      },
    } as never);
    vi.mocked(getAvailableSlots).mockResolvedValue([
      {
        start: new Date("2026-05-21T17:00:00.000Z"),
        end: new Date("2026-05-21T18:30:00.000Z"),
      },
      {
        start: new Date("2026-05-21T19:00:00.000Z"),
        end: new Date("2026-05-21T20:30:00.000Z"),
      },
    ] as never);
    vi.mocked(describeAvailableSlots).mockReturnValue("10:00 am or 12:00 pm");

    const response = await POST(
      makeRequest({
        args: {
          date: "next thursday",
          service_name: "Full Groom",
          preferred_time: "10 AM",
        },
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(getAvailableSlots).toHaveBeenCalledWith(
      "biz_1",
      expect.stringMatching(/^20\d{2}-\d{2}-\d{2}$/),
      90
    );
    expect(payload.available).toBe(true);
    expect(payload.requested_time_available).toBe(true);
    expect(payload.requested_slot.display_time).toBe("10:00 am");
    expect(payload.result).toContain("10 AM is available");
  });

  it("offers alternate slots when the preferred time is unavailable", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: {
        id: "biz_1",
        timezone: "America/Los_Angeles",
        services: [{ name: "Bath", duration: 60, isActive: true }],
      },
    } as never);
    vi.mocked(getAvailableSlots).mockResolvedValue([
      {
        start: new Date("2026-05-21T17:00:00.000Z"),
        end: new Date("2026-05-21T18:00:00.000Z"),
      },
    ] as never);
    vi.mocked(describeAvailableSlots).mockReturnValue("10:00 am");

    const response = await POST(
      makeRequest({
        args: {
          date: "May 21",
          service_name: "Bath",
          preferred_time: "2 PM",
        },
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.available).toBe(true);
    expect(payload.requested_time_available).toBe(false);
    expect(payload.available_slots).toHaveLength(1);
    expect(payload.result).toContain("2 PM isn't available");
    expect(payload.result).toContain("10:00 am");
  });

  it("returns a no-openings message when the calendar is full", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: {
        id: "biz_1",
        timezone: "America/Los_Angeles",
        services: [],
      },
    } as never);
    vi.mocked(getAvailableSlots).mockResolvedValue([]);

    const response = await POST(
      makeRequest({
        args: { date: "2026-05-21" },
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.available).toBe(false);
    expect(payload.available_slots).toEqual([]);
    expect(payload.result).toContain("don't have any openings");
  });

  it("falls back gracefully when availability lookup throws", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: {
        id: "biz_1",
        timezone: "America/Los_Angeles",
        services: [],
      },
    } as never);
    vi.mocked(getAvailableSlots).mockRejectedValue(new Error("calendar down"));

    const response = await POST(
      makeRequest({
        args: { date: "2026-05-21" },
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.result).toContain("Let me check with the owner");
  });
});
