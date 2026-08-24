import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    bookableFunnelEvent: {
      create: vi.fn(),
      groupBy: vi.fn(async () => []),
    },
  },
}));

import { getBookableFunnelDropoff } from "./bookable-analytics";

describe("bookable-analytics", () => {
  it("computes drop-off percentages along the funnel", async () => {
    const { prisma } = await import("@/lib/prisma");
    vi.mocked(prisma.bookableFunnelEvent.groupBy).mockResolvedValue([
      { event: "call_forwarded", _count: { event: 10 } },
      { event: "menu_started", _count: { event: 10 } },
      { event: "booking_selected", _count: { event: 8 } },
      { event: "service_selected", _count: { event: 6 } },
      { event: "slots_presented", _count: { event: 6 } },
      { event: "slot_selected", _count: { event: 4 } },
      { event: "booking_succeeded", _count: { event: 3 } },
    ] as never);

    const dropoff = await getBookableFunnelDropoff("biz_1", new Date());
    expect(dropoff.find((row) => row.event === "booking_selected")?.count).toBe(8);
    expect(dropoff.find((row) => row.event === "booking_succeeded")?.dropoffPct).toBe(25);
  });
});
