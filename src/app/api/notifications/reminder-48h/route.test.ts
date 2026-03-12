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
  send48hReminder: vi.fn(),
  sendNoResponseFollowUp: vi.fn(),
}));

import { verifyCronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { send48hReminder, sendNoResponseFollowUp } from "@/lib/notifications";
import { POST } from "./route";

describe("POST /api/notifications/reminder-48h", () => {
  beforeEach(() => {
    vi.mocked(verifyCronAuth).mockReset();
    vi.mocked(prisma.appointment.findMany).mockReset();
    vi.mocked(send48hReminder).mockReset();
    vi.mocked(sendNoResponseFollowUp).mockReset();
  });

  it("returns the cron auth error when unauthorized", async () => {
    vi.mocked(verifyCronAuth).mockReturnValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }) as never
    );

    const response = await POST(new Request("http://localhost/api/notifications/reminder-48h") as never);

    expect(response.status).toBe(401);
  });

  it("sends both 48-hour reminders and follow-ups while skipping businesses without numbers", async () => {
    vi.mocked(verifyCronAuth).mockReturnValue(null);
    vi.mocked(prisma.appointment.findMany)
      .mockResolvedValueOnce([
        {
          id: "appt_48h_sent",
          business: { phoneNumber: { number: "+16195559999" } },
        },
        {
          id: "appt_48h_skipped",
          business: { phoneNumber: null },
        },
      ] as never)
      .mockResolvedValueOnce([
        {
          id: "appt_followup_sent",
          business: { phoneNumber: { number: "+16195559999" } },
        },
        {
          id: "appt_followup_skipped",
          business: { phoneNumber: null },
        },
      ] as never);
    vi.mocked(send48hReminder).mockResolvedValue(undefined);
    vi.mocked(sendNoResponseFollowUp).mockResolvedValue(undefined);

    const response = await POST(new Request("http://localhost/api/notifications/reminder-48h") as never);
    const payload = await response.json();

    expect(send48hReminder).toHaveBeenCalledTimes(1);
    expect(sendNoResponseFollowUp).toHaveBeenCalledTimes(1);
    expect(payload).toEqual({
      reminders48h: { processed: 2, sent: 1, errors: 0 },
      followUps: { processed: 2, sent: 1 },
    });
  });
});
