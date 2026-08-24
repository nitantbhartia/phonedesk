import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: { findFirst: vi.fn() },
    call: { create: vi.fn() },
  },
}));

vi.mock("@/lib/bookable", () => ({
  resolveInboundPath: vi.fn(() => "BOOKABLE_VOICEMAIL"),
  startBookableCall: vi.fn(),
}));

vi.mock("@/lib/twilio", async () => {
  const actual = await vi.importActual<typeof import("@/lib/twilio")>("@/lib/twilio");
  return {
    ...actual,
    verifyTwilioSignature: vi.fn(() => true),
  };
});

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { startBookableCall } from "@/lib/bookable";

function twilioRequest(params: Record<string, string>) {
  return new Request("http://localhost/api/voice/inbound", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
  });
}

describe("POST /api/voice/inbound", () => {
  beforeEach(() => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: { id: "biz_1", inboundPath: "BOOKABLE_VOICEMAIL" },
    } as never);
    vi.mocked(prisma.call.create).mockResolvedValue({ id: "call_1" } as never);
    vi.mocked(startBookableCall).mockResolvedValue({
      session: { id: "sess_1" },
      prompt: { say: "Thanks for calling Spawkles. To book, press 1. To leave a message, press 9." },
      shopName: "Spawkles",
    } as never);
  });

  it("returns a keypad gather for Bookable shops", async () => {
    const response = await POST(
      twilioRequest({
        CallSid: "CA123",
        From: "+16195550100",
        To: "+16195559999",
      }) as never
    );
    const xml = await response.text();
    expect(response.headers.get("content-type")).toContain("text/xml");
    expect(xml).toContain("<Gather");
    expect(xml).toContain("Thanks for calling Spawkles");
    expect(xml).not.toMatch(/\bAI\b|virtual receptionist|\bassistant\b/i);
    expect(xml).toContain("/api/voice/gather?sid=sess_1");
  });
});
