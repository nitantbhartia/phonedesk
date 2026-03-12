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

vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { POST } from "./route";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/notifications/lapsing-blast", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/notifications/lapsing-blast", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(sendSms).mockReset();
    delete process.env.TWILIO_PHONE_NUMBER;
  });

  it("returns 401 without an authenticated user", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const response = await POST(makeRequest({ customerPhones: ["+16195550100"] }) as never);

    expect(response.status).toBe(401);
  });

  it("returns 400 when there is no configured business number", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue(null);

    const response = await POST(makeRequest({ customerPhones: ["+16195550100"] }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "No phone number configured" });
  });

  it("returns 400 when no customers are provided", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      name: "Paw House",
      phoneNumber: { number: "+16195559999" },
    } as never);

    const response = await POST(makeRequest({ customerPhones: [] }) as never);

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "No customers provided" });
  });

  it("sends blast messages and reports partial failures", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      name: "Paw House",
      phoneNumber: { number: "+16195559999" },
    } as never);
    vi.mocked(sendSms)
      .mockResolvedValueOnce(undefined)
      .mockRejectedValueOnce(new Error("twilio down"));

    const response = await POST(
      makeRequest({ customerPhones: ["+16195550100", "+16195550101"] }) as never
    );
    const payload = await response.json();

    expect(sendSms).toHaveBeenNthCalledWith(
      1,
      "+16195550100",
      expect.stringContaining("Paw House"),
      "+16195559999"
    );
    expect(payload).toEqual({
      sent: 1,
      total: 2,
      results: [
        { phone: "+16195550100", success: true },
        { phone: "+16195550101", success: false },
      ],
    });
  });
});
