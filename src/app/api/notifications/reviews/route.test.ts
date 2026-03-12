import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/cron-auth", () => ({
  verifyCronAuth: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: {
      findMany: vi.fn(),
      update: vi.fn(),
    },
    reviewRequest: {
      findFirst: vi.fn(),
      create: vi.fn(),
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

describe("POST /api/notifications/reviews", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T18:00:00.000Z"));
    vi.mocked(verifyCronAuth).mockReset();
    vi.mocked(prisma.appointment.findMany).mockReset();
    vi.mocked(prisma.appointment.update).mockReset();
    vi.mocked(prisma.reviewRequest.findFirst).mockReset();
    vi.mocked(prisma.reviewRequest.create).mockReset();
    vi.mocked(sendSms).mockReset();
  });

  it("returns the cron auth error when unauthorized", async () => {
    vi.mocked(verifyCronAuth).mockReturnValue(
      Response.json({ error: "Unauthorized" }, { status: 401 }) as never
    );

    const response = await POST(new Request("http://localhost/api/notifications/reviews") as never);

    expect(response.status).toBe(401);
  });

  it("sends review requests only when the business and customer are eligible", async () => {
    vi.mocked(verifyCronAuth).mockReturnValue(null);
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      {
        id: "appt_send",
        customerPhone: "+16195550100",
        customerName: "Jamie",
        petName: "Buddy",
        business: {
          id: "biz_1",
          name: "Paw House",
          googleReviewUrl: "https://google.example/review",
          phoneNumber: { number: "+16195559999" },
        },
      },
      {
        id: "appt_skip_recent",
        customerPhone: "+16195550101",
        customerName: "Morgan",
        petName: "Luna",
        business: {
          id: "biz_1",
          name: "Paw House",
          googleReviewUrl: "https://google.example/review",
          phoneNumber: { number: "+16195559999" },
        },
      },
      {
        id: "appt_skip_no_review_url",
        customerPhone: "+16195550102",
        customerName: "Taylor",
        petName: "Milo",
        business: {
          id: "biz_1",
          name: "Paw House",
          googleReviewUrl: null,
          phoneNumber: { number: "+16195559999" },
        },
      },
    ] as never);
    vi.mocked(prisma.reviewRequest.findFirst)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({ id: "recent_1" } as never);
    vi.mocked(prisma.reviewRequest.create).mockResolvedValue({
      id: "review_1",
    } as never);
    vi.mocked(prisma.appointment.update).mockResolvedValue({ id: "appt_send" } as never);
    vi.mocked(sendSms).mockResolvedValue(undefined);

    const response = await POST(new Request("http://localhost/api/notifications/reviews") as never);
    const payload = await response.json();

    expect(prisma.reviewRequest.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz_1",
        customerPhone: "+16195550100",
        customerName: "Jamie",
        petName: "Buddy",
        appointmentId: "appt_send",
      },
    });
    expect(sendSms).toHaveBeenCalledWith(
      "+16195550100",
      expect.stringContaining("http://localhost:3000/api/reviews/click?id=review_1"),
      "+16195559999"
    );
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_send" },
      data: { reviewRequested: true },
    });
    expect(payload).toEqual({ ok: true, sent: 1, errors: 0 });
  });
});
