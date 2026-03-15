import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      upsert: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    phoneNumber: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/rate-limit", () => ({
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/retell", () => ({
  deleteRetellPhoneNumber: vi.fn(),
  provisionRetellPhoneNumber: vi.fn(),
  syncRetellAgent: vi.fn(),
}));

vi.mock("@/lib/retell-auth", () => ({
  buildRetellWebhookUrl: vi.fn(() => "https://app.example.com/api/sms/webhook"),
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import {
  deleteRetellPhoneNumber,
  provisionRetellPhoneNumber,
  syncRetellAgent,
} from "@/lib/retell";
import { POST } from "./route";

describe("POST /api/provision-number", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    process.env.TWILIO_ACCOUNT_SID = "AC1234567890";
    process.env.TWILIO_AUTH_TOKEN = "token1234";
    process.env.TWILIO_PHONE_NUMBER = "+16195559999";
    delete process.env.SMS_ENABLED;
    delete process.env.STRIPE_BYPASS;
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.user.upsert).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.phoneNumber.findUnique).mockReset();
    vi.mocked(prisma.$transaction).mockReset();
    vi.mocked(rateLimit).mockReset();
    vi.mocked(syncRetellAgent).mockReset();
    vi.mocked(provisionRetellPhoneNumber).mockReset();
    vi.mocked(deleteRetellPhoneNumber).mockReset();
    vi.mocked(rateLimit).mockReturnValue({ allowed: true, remaining: 2 } as never);
  });

  it("returns 429 when the user is rate limited", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "owner@example.com" } } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(rateLimit).mockReturnValue({ allowed: false, remaining: 0 } as never);

    const response = await POST(new Request("http://localhost/api/provision-number", { method: "POST" }) as never);

    expect(response.status).toBe(429);
  });

  it("requires an active subscription or billing consent", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "owner@example.com" } } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      billingConsentGiven: false,
      stripeSubscriptionId: null,
      phoneNumber: null,
      services: [],
      retellConfig: null,
      breedRecommendations: [],
    } as never);

    const response = await POST(new Request("http://localhost/api/provision-number", { method: "POST" }) as never);

    expect(response.status).toBe(402);
    await expect(response.json()).resolves.toEqual({ error: "subscription_required" });
  });

  it("returns the existing number when the business is already provisioned", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "owner@example.com" } } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      billingConsentGiven: true,
      stripeSubscriptionId: null,
      phoneNumber: { number: "+16195559999" },
      services: [],
      retellConfig: null,
      breedRecommendations: [],
    } as never);

    const response = await POST(new Request("http://localhost/api/provision-number", { method: "POST" }) as never);

    await expect(response.json()).resolves.toEqual({
      phoneNumber: "+16195559999",
      alreadyProvisioned: true,
    });
  });

  it("provisions a new number and persists it in a transaction", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "owner@example.com" } } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      name: "Paw House",
      billingConsentGiven: true,
      stripeSubscriptionId: null,
      phoneNumber: null,
      services: [],
      retellConfig: { agentId: "agent_1" },
      breedRecommendations: [],
    } as never);
    vi.mocked(prisma.phoneNumber.findUnique).mockResolvedValue(null);
    vi.mocked(provisionRetellPhoneNumber).mockResolvedValue({
      phone_number: "+16195559999",
    } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: never) => fn({
      $executeRaw: vi.fn(),
      phoneNumber: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      business: {
        update: vi.fn(),
      },
    }) as never);

    const response = await POST(new Request("http://localhost/api/provision-number", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ areaCode: 619 }),
    }) as never);

    expect(provisionRetellPhoneNumber).toHaveBeenCalledWith({
      agentId: "agent_1",
      areaCode: 619,
      nickname: "Paw House - RingPaw",
      smsWebhookUrl: "https://app.example.com/api/sms/webhook",
    });
    await expect(response.json()).resolves.toEqual({
      phoneNumber: "+16195559999",
      alreadyProvisioned: false,
    });
  });

  it("omits the sms webhook when sms is disabled", async () => {
    process.env.SMS_ENABLED = "false";
    vi.mocked(getServerSession).mockResolvedValue({ user: { email: "owner@example.com" } } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      name: "Paw House",
      billingConsentGiven: true,
      stripeSubscriptionId: null,
      phoneNumber: null,
      services: [],
      retellConfig: { agentId: "agent_1" },
      breedRecommendations: [],
    } as never);
    vi.mocked(prisma.phoneNumber.findUnique).mockResolvedValue(null);
    vi.mocked(provisionRetellPhoneNumber).mockResolvedValue({
      phone_number: "+16195559999",
    } as never);
    vi.mocked(prisma.$transaction).mockImplementation(async (fn: never) => fn({
      $executeRaw: vi.fn(),
      phoneNumber: {
        findUnique: vi.fn().mockResolvedValue(null),
        create: vi.fn(),
      },
      business: {
        update: vi.fn(),
      },
    }) as never);

    await POST(new Request("http://localhost/api/provision-number", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ areaCode: 619 }),
    }) as never);

    expect(provisionRetellPhoneNumber).toHaveBeenCalledWith({
      agentId: "agent_1",
      areaCode: 619,
      nickname: "Paw House - RingPaw",
      smsWebhookUrl: undefined,
    });
  });
});
