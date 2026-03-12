import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: {
      findFirst: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/retell-auth", () => ({
  isRetellWebhookValid: vi.fn(),
}));

vi.mock("@/lib/demo-session", () => ({
  resolveBusinessFromDemo: vi.fn(),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { isRetellWebhookValid } from "@/lib/retell-auth";

const businessRecord = {
  id: "biz_1",
  name: "Paw House",
  ownerName: "Jordan",
  phone: "+16195550000",
  city: "San Diego",
  state: "CA",
  address: "123 Main St",
  businessHours: {
    mon: { open: "09:00", close: "17:00" },
    tue: { open: "09:00", close: "17:00" },
  },
  phoneNumber: { number: "+16195559999" },
  services: [],
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/retell/business-faq", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-retell-signature": "sig",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/retell/business-faq", () => {
  beforeEach(() => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(true);
    vi.mocked(prisma.phoneNumber.findFirst).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();

    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: businessRecord,
    } as never);
  });

  it("rejects unauthorized requests", async () => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(false);

    const response = await POST(makeRequest({ args: {}, call: {} }) as never);

    expect(response.status).toBe(401);
  });

  it("answers hours questions from the business profile", async () => {
    const response = await POST(
      makeRequest({
        args: { question: "What time are you open on Monday?" },
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.topic).toBe("hours");
    expect(payload.answerable).toBe(true);
    expect(payload.result).toContain("Paw House is currently open");
    expect(payload.result).toContain("Monday");
  });

  it("falls back safely when a custom cancellation policy is not on file", async () => {
    const response = await POST(
      makeRequest({
        args: { question: "Do you charge a cancellation fee?" },
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.topic).toBe("policy");
    expect(payload.answerable).toBe(false);
    expect(payload.result).toContain("custom policy");
    expect(payload.result).toContain("Jordan");
  });
});
