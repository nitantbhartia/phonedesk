import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cron-auth", () => ({
  verifyCronAuth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: {
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/notifications", () => ({
  sendOnMyWayReminder: vi.fn(),
}));

import { verifyCronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { sendOnMyWayReminder } from "@/lib/notifications";
import { POST } from "./route";

describe("POST /api/notifications/reminder-30m", () => {
  beforeEach(() => {
    vi.mocked(verifyCronAuth).mockReset();
    vi.mocked(prisma.appointment.findMany).mockReset();
    vi.mocked(sendOnMyWayReminder).mockReset();
  });

  it("returns the cron auth error when unauthorized", async () => {
    vi.mocked(verifyCronAuth).mockReturnValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }) as never
    );

    const response = await POST(new Request("http://localhost/api/notifications/reminder-30m") as never);

    expect(response.status).toBe(401);
  });

  it("sends 30-minute reminders only for businesses with an active phone number", async () => {
    vi.mocked(verifyCronAuth).mockReturnValue(null);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      {
        id: "appt_send",
        business: { phoneNumber: { number: "+16195559999" } },
      },
      {
        id: "appt_skip",
        business: { phoneNumber: null },
      },
    ] as never);
    vi.mocked(sendOnMyWayReminder).mockResolvedValue(undefined);

    const response = await POST(new Request("http://localhost/api/notifications/reminder-30m") as never);
    const payload = await response.json();

    expect(sendOnMyWayReminder).toHaveBeenCalledTimes(1);
    expect(payload).toEqual({
      reminders30m: { processed: 2, sent: 1, errors: 0 },
    });
  });
});
