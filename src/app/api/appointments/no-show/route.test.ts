import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    appointment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/route-helpers", () => ({
  requireCurrentBusiness: vi.fn(),
  parseJsonBody: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { parseJsonBody, requireCurrentBusiness } from "@/lib/route-helpers";
import { POST } from "./route";

describe("appointments/no-show", () => {
  beforeEach(() => {
    vi.mocked(prisma.appointment.findFirst).mockReset();
    vi.mocked(prisma.appointment.update).mockReset();
    vi.mocked(requireCurrentBusiness).mockReset();
    vi.mocked(parseJsonBody).mockReset();
    vi.mocked(requireCurrentBusiness).mockResolvedValue({
      business: { id: "biz_1" },
      userId: "user_1",
    } as never);
    vi.mocked(parseJsonBody).mockResolvedValue({
      data: { appointmentId: "appt_1" },
    } as never);
  });

  it("rejects completed appointments", async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: "appt_1",
      status: "COMPLETED",
    } as never);

    const response = await POST(
      new Request("http://localhost/api/appointments/no-show", {
        method: "POST",
        body: JSON.stringify({ appointmentId: "appt_1" }),
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Only active appointments can be marked as no-show");
    expect(prisma.appointment.update).not.toHaveBeenCalled();
  });

  it("returns 404 when the appointment does not belong to the business", async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue(null);

    const response = await POST(
      new Request("http://localhost/api/appointments/no-show", {
        method: "POST",
      }) as never
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({
      error: "Appointment not found",
    });
  });

  it("marks active appointments as no-show", async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: "appt_1",
      status: "CONFIRMED",
    } as never);

    const response = await POST(
      new Request("http://localhost/api/appointments/no-show", {
        method: "POST",
      }) as never
    );

    expect(response.status).toBe(200);
    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_1" },
      data: {
        status: "NO_SHOW",
        noShowMarkedAt: expect.any(Date),
      },
    });
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
