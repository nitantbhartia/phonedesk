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
  getConflicts: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { getConflicts } from "@/lib/calendar";
import { GET } from "./route";

describe("GET /api/calendar/conflicts", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T18:00:00.000Z"));
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(getConflicts).mockReset();
  });

  it("returns 401 without a session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/calendar/conflicts?days=3") as never
    );

    expect(response.status).toBe(401);
  });

  it("returns 404 when the business is missing", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/calendar/conflicts?days=3") as never
    );

    expect(response.status).toBe(404);
  });

  it("caps the lookahead window and maps conflicts to JSON-safe fields", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      timezone: "America/New_York",
    } as never);
    vi.mocked(getConflicts).mockResolvedValue([
      {
        start: new Date("2026-03-12T19:00:00.000Z"),
        end: new Date("2026-03-12T20:00:00.000Z"),
        summary: "Existing booking",
        source: "google",
      },
    ] as never);

    const response = await GET(
      new Request("http://localhost/api/calendar/conflicts?days=99") as never
    );
    const payload = await response.json();

    expect(vi.mocked(getConflicts).mock.calls[0]?.[0]).toBe("biz_1");
    expect(vi.mocked(getConflicts).mock.calls[0]?.[1]).toEqual(new Date("2026-03-12T18:00:00.000Z"));
    expect(vi.mocked(getConflicts).mock.calls[0]?.[2]).toEqual(new Date("2026-03-19T07:00:00.000Z"));
    expect(payload).toEqual({
      conflicts: [
        {
          start: "2026-03-12T19:00:00.000Z",
          end: "2026-03-12T20:00:00.000Z",
          summary: "Existing booking",
          source: "google",
        },
      ],
      timezone: "America/New_York",
    });
  });

  it("returns 500 when conflict lookup fails", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      timezone: "America/Los_Angeles",
    } as never);
    vi.mocked(getConflicts).mockRejectedValue(new Error("calendar down"));

    const response = await GET(
      new Request("http://localhost/api/calendar/conflicts?days=2") as never
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to fetch conflicts" });
  });
});
