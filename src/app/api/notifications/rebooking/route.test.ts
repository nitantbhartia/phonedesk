import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cron-auth", () => ({
  verifyCronAuth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    rebookingConfig: {
      findMany: vi.fn(),
    },
    appointment: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(),
}));

import { verifyCronAuth } from "@/lib/cron-auth";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { POST } from "./route";

describe("POST /api/notifications/rebooking", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T18:00:00.000Z"));
    vi.mocked(verifyCronAuth).mockReset();
    vi.mocked(prisma.rebookingConfig.findMany).mockReset();
    vi.mocked(prisma.appointment.findMany).mockReset();
    vi.mocked(prisma.appointment.update).mockReset();
    vi.mocked(sendSms).mockReset();
  });

  it("returns the cron auth error when unauthorized", async () => {
    vi.mocked(verifyCronAuth).mockReturnValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }) as never
    );

    const response = await POST(new Request("http://localhost/api/notifications/rebooking") as never);

    expect(response.status).toBe(401);
  });

  it("sends reminders only for appointments that are actually due", async () => {
    vi.mocked(verifyCronAuth).mockReturnValue(null);
    vi.mocked(prisma.rebookingConfig.findMany).mockResolvedValue([
      {
        enabled: true,
        defaultInterval: 42,
        reminderDaysBefore: 7,
        business: {
          id: "biz_1",
          name: "Paw House",
          phone: "+16195559999",
          phoneNumber: { number: "+16195559999" },
        },
      },
    ] as never);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      {
        id: "appt_due",
        businessId: "biz_1",
        customerName: "Jamie",
        customerPhone: "+16195550100",
        petName: "Buddy",
        completedAt: new Date("2026-01-20T18:00:00.000Z"),
        rebookSent: false,
        rebookInterval: null,
      },
      {
        id: "appt_not_due",
        businessId: "biz_1",
        customerName: "Morgan",
        customerPhone: "+16195550101",
        petName: "Luna",
        completedAt: new Date("2026-02-20T18:00:00.000Z"),
        rebookSent: false,
        rebookInterval: 42,
      },
      {
        id: "appt_no_phone",
        businessId: "biz_1",
        customerName: "No Phone",
        customerPhone: null,
        petName: "Milo",
        completedAt: new Date("2026-01-20T18:00:00.000Z"),
        rebookSent: false,
        rebookInterval: null,
      },
    ] as never);
    vi.mocked(sendSms).mockResolvedValue(undefined);
    vi.mocked(prisma.appointment.update).mockResolvedValue({ id: "appt_due" } as never);

    const response = await POST(new Request("http://localhost/api/notifications/rebooking") as never);
    const payload = await response.json();

    expect(sendSms).toHaveBeenCalledTimes(1);
    expect(sendSms).toHaveBeenCalledWith(
      "+16195550100",
      expect.stringContaining("Buddy is due for their next groom"),
      "+16195559999"
    );
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_due" },
      data: { rebookSent: true },
    });
    expect(payload).toEqual({ ok: true, sent: 1, errors: 0 });
  });
});
