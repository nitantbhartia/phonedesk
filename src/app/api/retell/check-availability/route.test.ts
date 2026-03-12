import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: {
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

vi.mock("@/lib/demo-session", () => ({
  resolveBusinessFromDemo: vi.fn(async () => null),
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

  it("understands 'tomorrow' and suggests the nearest slots for off-grid times", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-11T22:20:00.000Z"));
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: {
        id: "biz_1",
        timezone: "America/Los_Angeles",
        services: [{ name: "Full Groom", duration: 60, isActive: true }],
      },
    } as never);
    vi.mocked(getAvailableSlots).mockResolvedValue([
      {
        start: new Date("2026-03-12T17:00:00.000Z"),
        end: new Date("2026-03-12T18:00:00.000Z"),
      },
      {
        start: new Date("2026-03-12T17:30:00.000Z"),
        end: new Date("2026-03-12T18:30:00.000Z"),
      },
      {
        start: new Date("2026-03-12T18:00:00.000Z"),
        end: new Date("2026-03-12T19:00:00.000Z"),
      },
    ] as never);
    vi.mocked(describeAvailableSlots).mockReturnValue(
      "10:00 am, 10:30 am, or 11:00 am"
    );

    const response = await POST(
      makeRequest({
        args: {
          date: "tomorrow",
          service_name: "Full Groom",
          preferred_time: "10:10 am",
        },
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(getAvailableSlots).toHaveBeenCalledWith("biz_1", "2026-03-12", 60);
    expect(payload.available).toBe(true);
    expect(payload.requested_time_available).toBe(false);
    expect(payload.available_slots.map((slot: { display_time: string }) => slot.display_time)).toEqual([
      "10:00 am",
      "10:30 am",
      "11:00 am",
    ]);
    expect(payload.result).toContain("10:00 am or 10:30 am");
    vi.useRealTimers();
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

  // Fix #1 — "tomorrow" / "today" regression
  describe("normalizeDateInput date-word regressions", () => {
    beforeEach(() => {
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
        business: {
          id: "biz_1",
          timezone: "America/Los_Angeles",
          services: [],
        },
      } as never);
      vi.mocked(getAvailableSlots).mockResolvedValue([]);
      // Fix the clock to Monday 2026-03-09 12:00 PST (20:00 UTC)
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-03-09T20:00:00Z"));
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("resolves 'today' to today's date", async () => {
      await POST(
        makeRequest({ args: { date: "today" }, call: { to_number: "+16195559999" } }) as never
      );
      expect(getAvailableSlots).toHaveBeenCalledWith("biz_1", "2026-03-09", expect.any(Number));
    });

    it("resolves 'tomorrow' to tomorrow's date", async () => {
      await POST(
        makeRequest({ args: { date: "tomorrow" }, call: { to_number: "+16195559999" } }) as never
      );
      expect(getAvailableSlots).toHaveBeenCalledWith("biz_1", "2026-03-10", expect.any(Number));
    });

    // #10 — bare weekday on same day rolls to next week; agent prompt asks caller to clarify
    it("resolves bare 'monday' on a Monday to next week (agent handles same-day clarification)", async () => {
      await POST(
        makeRequest({ args: { date: "monday" }, call: { to_number: "+16195559999" } }) as never
      );
      expect(getAvailableSlots).toHaveBeenCalledWith("biz_1", "2026-03-16", expect.any(Number));
    });

    it("resolves 'next monday' on a Monday to 7 days later", async () => {
      await POST(
        makeRequest({ args: { date: "next monday" }, call: { to_number: "+16195559999" } }) as never
      );
      expect(getAvailableSlots).toHaveBeenCalledWith("biz_1", "2026-03-16", expect.any(Number));
    });

    it("resolves 'this monday' on a Monday to today", async () => {
      await POST(
        makeRequest({ args: { date: "this monday" }, call: { to_number: "+16195559999" } }) as never
      );
      expect(getAvailableSlots).toHaveBeenCalledWith("biz_1", "2026-03-09", expect.any(Number));
    });
  });

  // Fix #6 — bare time without AM/PM should default to PM for hours 1-7
  describe("timeTextToMinutes AM/PM inference regressions", () => {
    beforeEach(() => {
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
        business: {
          id: "biz_1",
          timezone: "America/Los_Angeles",
          services: [],
        },
      } as never);
      vi.mocked(describeAvailableSlots).mockReturnValue("2:00 pm");
    });

    it("treats bare '2' (no AM/PM) as 2pm and matches a 2pm slot", async () => {
      // 2pm PST (UTC-8) = 22:00 UTC on 2026-12-15
      vi.mocked(getAvailableSlots).mockResolvedValue([
        { start: new Date("2026-12-15T22:00:00Z"), end: new Date("2026-12-15T23:30:00Z") },
      ] as never);

      const res = await POST(
        makeRequest({
          args: { date: "2026-12-15", preferred_time: "2" },
          call: { to_number: "+16195559999" },
        }) as never
      );
      const payload = await res.json();

      expect(payload.requested_time_available).toBe(true);
    });

    it("treats bare '2:30' (no AM/PM) as 2:30pm and matches a 2:30pm slot", async () => {
      // 2:30pm PST = 22:30 UTC on 2026-12-15
      vi.mocked(getAvailableSlots).mockResolvedValue([
        { start: new Date("2026-12-15T22:30:00Z"), end: new Date("2026-12-15T23:30:00Z") },
      ] as never);

      const res = await POST(
        makeRequest({
          args: { date: "2026-12-15", preferred_time: "2:30" },
          call: { to_number: "+16195559999" },
        }) as never
      );
      const payload = await res.json();

      expect(payload.requested_time_available).toBe(true);
    });

    it("keeps bare '9' (no AM/PM) as 9am and matches a 9am slot", async () => {
      // 9am PST = 17:00 UTC on 2026-12-15
      vi.mocked(getAvailableSlots).mockResolvedValue([
        { start: new Date("2026-12-15T17:00:00Z"), end: new Date("2026-12-15T18:30:00Z") },
      ] as never);

      const res = await POST(
        makeRequest({
          args: { date: "2026-12-15", preferred_time: "9" },
          call: { to_number: "+16195559999" },
        }) as never
      );
      const payload = await res.json();

      expect(payload.requested_time_available).toBe(true);
    });
  });

  // Fix #8 — slot descriptions should only cover the top-3 offered slots
  it("calls describeAvailableSlots with only the top 3 slots when more are available", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: {
        id: "biz_1",
        timezone: "America/Los_Angeles",
        services: [],
      },
    } as never);

    const makeSlot = (utcHour: number) => ({
      start: new Date(`2026-12-15T${String(utcHour).padStart(2, "0")}:00:00Z`),
      end: new Date(`2026-12-15T${String(utcHour + 1).padStart(2, "0")}:00:00Z`),
    });
    vi.mocked(getAvailableSlots).mockResolvedValue([
      makeSlot(16), makeSlot(17), makeSlot(18), makeSlot(19), makeSlot(20),
    ] as never);
    vi.mocked(describeAvailableSlots).mockReturnValue("9 am, 10 am, or 11 am");

    const res = await POST(
      makeRequest({
        args: { date: "2026-12-15" },
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await res.json();

    const callArgs = vi.mocked(describeAvailableSlots).mock.calls[0][0];
    expect(callArgs).toHaveLength(3);
    expect(payload.available_slots).toHaveLength(3);
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
