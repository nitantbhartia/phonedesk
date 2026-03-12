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
    intakeForm: {
      create: vi.fn(),
      findMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/sms", () => ({
  sendSms: vi.fn(),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";
import { GET, POST } from "./route";

describe("/api/intake", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.intakeForm.create).mockReset();
    vi.mocked(prisma.intakeForm.findMany).mockReset();
    vi.mocked(sendSms).mockReset();
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    delete process.env.TWILIO_PHONE_NUMBER;
  });

  it("creates an intake form and sends the intake link when the business has a phone number", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      name: "Paw House",
      phoneNumber: { number: "+16195559999" },
    } as never);
    vi.mocked(prisma.intakeForm.create).mockResolvedValue({
      id: "intake_1",
      token: "tok_123",
    } as never);
    vi.mocked(sendSms).mockResolvedValue(undefined);

    const response = await POST(new Request("http://localhost/api/intake", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ customerPhone: "+16195550100", customerName: "Jamie", appointmentId: "appt_1" }),
    }) as never);

    expect(prisma.intakeForm.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz_1",
        customerPhone: "+16195550100",
        customerName: "Jamie",
        appointmentId: "appt_1",
      },
    });
    expect(sendSms).toHaveBeenCalledWith(
      "+16195550100",
      expect.stringContaining("https://app.example.com/intake/tok_123"),
      "+16195559999"
    );
    await expect(response.json()).resolves.toEqual({ ok: true, intakeId: "intake_1", token: "tok_123" });
  });

  it("returns an empty list when the user has no business on GET", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue(null);

    const response = await GET();

    await expect(response.json()).resolves.toEqual({ forms: [] });
  });
});
