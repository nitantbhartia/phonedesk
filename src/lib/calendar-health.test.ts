import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarConnection: { findFirst: vi.fn() },
  },
}));

import { prisma } from "@/lib/prisma";
import { getCalendarHealth } from "./calendar-health";

describe("calendar-health", () => {
  it("forces request mode when calendar is not connected", async () => {
    vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue(null);
    const health = await getCalendarHealth("biz_1");
    expect(health.forceRequestMode).toBe(true);
    expect(health.canWriteEvents).toBe(false);
  });

  it("reports write capability for healthy Google connection", async () => {
    vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue({
      provider: "GOOGLE",
      accessToken: "token",
      tokenExpiry: new Date(Date.now() + 60 * 60 * 1000),
      isActive: true,
      isPrimary: true,
    } as never);
    const health = await getCalendarHealth("biz_1");
    expect(health.canWriteEvents).toBe(true);
    expect(health.forceRequestMode).toBe(false);
  });
});
