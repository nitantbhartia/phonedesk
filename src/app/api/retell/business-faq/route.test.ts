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
  timezone: "America/Los_Angeles",
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
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-09T17:00:00.000Z"));

    const response = await POST(
      makeRequest({
        args: { question: "What time are you open on Monday?" },
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.topic).toBe("hours");
    expect(payload.answerable).toBe(true);
    expect(payload.result).toContain("Paw House is open right now");
    expect(payload.result).toContain("Monday");
    vi.useRealTimers();
  });

  it("marks the business closed when the caller asks after hours", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-10T03:30:00.000Z"));

    const response = await POST(
      makeRequest({
        args: { question: "Are you open right now?" },
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.topic).toBe("hours");
    expect(payload.answerable).toBe(true);
    expect(payload.result).toContain("closed right now");
    vi.useRealTimers();
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

  it("asks for the caller question when none is provided", async () => {
    const response = await POST(
      makeRequest({
        args: {},
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.answerable).toBe(false);
    expect(payload.result).toContain("Tell me what the caller is asking");
  });

  it("answers location questions from the business profile", async () => {
    const response = await POST(
      makeRequest({
        args: { question: "Where are you located?" },
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.topic).toBe("location");
    expect(payload.answerable).toBe(true);
    expect(payload.result).toContain("123 Main St, San Diego, CA");
  });

  it("returns the best callback number for contact questions", async () => {
    const response = await POST(
      makeRequest({
        args: { question: "What number should I call back?" },
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.topic).toBe("contact");
    expect(payload.answerable).toBe(true);
    expect(payload.result).toContain("+16195550000");
  });

  it("uses the service list fallback for pricing questions", async () => {
    const response = await POST(
      makeRequest({
        args: { question: "How much does it cost?" },
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.topic).toBe("pricing");
    expect(payload.answerable).toBe(false);
    expect(payload.result).toContain("live service list");
  });

  it("gives a first-visit answer for new customer questions", async () => {
    const response = await POST(
      makeRequest({
        args: { question: "What should I bring for a first visit?" },
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.topic).toBe("first_visit");
    expect(payload.answerable).toBe(true);
    expect(payload.result).toContain("quick intake form");
  });

  it("falls back for questions with no reliable answer on file", async () => {
    const response = await POST(
      makeRequest({
        args: { question: "Do you use hypoallergenic shampoo?" },
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.topic).toBe("general");
    expect(payload.answerable).toBe(false);
    expect(payload.result).toContain("Jordan");
  });
});
