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
    appointment: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    user: {
      upsert: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { POST } from "./route";

describe("appointments/no-show", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.appointment.findFirst).mockReset();
    vi.mocked(prisma.appointment.update).mockReset();
  });

  it("rejects completed appointments", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);
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
});
