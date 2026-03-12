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
  bookAppointment: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { bookAppointment } from "@/lib/calendar";
import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/calendar/book", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/calendar/book", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(bookAppointment).mockReset();
  });

  it("returns 401 without a session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await POST(makeRequest({}) as never);

    expect(response.status).toBe(401);
  });

  it("returns 404 when the business is missing", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue(null);

    const response = await POST(makeRequest({}) as never);

    expect(response.status).toBe(404);
  });

  it("passes the booking payload through with parsed times", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);
    vi.mocked(bookAppointment).mockResolvedValue({
      id: "appt_1",
    } as never);

    const response = await POST(
      makeRequest({
        customerName: "Jamie",
        customerPhone: "+16195550100",
        petName: "Buddy",
        petBreed: "Poodle",
        petSize: "MEDIUM",
        serviceName: "Bath",
        servicePrice: 75,
        startTime: "2026-03-15T09:00:00.000Z",
        endTime: "2026-03-15T10:00:00.000Z",
        notes: "Sensitive paws",
      }) as never
    );
    const payload = await response.json();

    expect(bookAppointment).toHaveBeenCalledWith("biz_1", {
      customerName: "Jamie",
      customerPhone: "+16195550100",
      petName: "Buddy",
      petBreed: "Poodle",
      petSize: "MEDIUM",
      serviceName: "Bath",
      servicePrice: 75,
      startTime: new Date("2026-03-15T09:00:00.000Z"),
      endTime: new Date("2026-03-15T10:00:00.000Z"),
      notes: "Sensitive paws",
    });
    expect(payload).toEqual({ appointment: { id: "appt_1" } });
  });

  it("returns 500 when booking fails", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);
    vi.mocked(bookAppointment).mockRejectedValue(new Error("calendar down"));

    const response = await POST(makeRequest({ startTime: "2026-03-15T09:00:00.000Z" }) as never);

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({ error: "Failed to book appointment" });
  });
});
