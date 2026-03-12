import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/calendar", () => ({
  getAvailableSlots: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getAvailableSlots } from "@/lib/calendar";
import { GET } from "./route";

describe("GET /api/calendar/availability", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(getAvailableSlots).mockReset();
  });

  it("returns 401 without a session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/calendar/availability?date=2026-03-15") as never
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 when the business is missing", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/calendar/availability?date=2026-03-15") as never
    );

    expect(response.status).toBe(404);
  });

  it("returns the available slots for the requested date and duration", async () => {
    const slots = [
      {
        start: new Date("2026-03-15T16:00:00.000Z"),
        end: new Date("2026-03-15T17:00:00.000Z"),
      },
    ];
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);
    vi.mocked(getAvailableSlots).mockResolvedValue(slots as never);

    const response = await GET(
      new Request("http://localhost/api/calendar/availability?date=2026-03-15&duration=90") as never
    );
    const payload = await response.json();

    expect(getAvailableSlots).toHaveBeenCalledWith("biz_1", "2026-03-15", 90);
    expect(payload).toEqual({
      slots: [
        {
          start: "2026-03-15T16:00:00.000Z",
          end: "2026-03-15T17:00:00.000Z",
        },
      ],
    });
  });

  it("returns 500 when slot lookup throws", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);
    vi.mocked(getAvailableSlots).mockRejectedValue(new Error("calendar down"));

    const response = await GET(
      new Request("http://localhost/api/calendar/availability?date=2026-03-15") as never
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to fetch availability" });
  });
});
