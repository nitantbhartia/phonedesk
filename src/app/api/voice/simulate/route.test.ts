import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: { findUnique: vi.fn(), findFirst: vi.fn() },
    phoneNumber: { findFirst: vi.fn() },
    bookableSession: { findUnique: vi.fn() },
    call: { create: vi.fn() },
  },
}));

vi.mock("@/lib/bookable", () => ({
  resolveInboundPath: vi.fn(() => "BOOKABLE_VOICEMAIL"),
  startBookableCall: vi.fn(),
  handleBookableDigit: vi.fn(),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { handleBookableDigit, startBookableCall } from "@/lib/bookable";

describe("POST /api/voice/simulate", () => {
  beforeEach(() => {
    vi.mocked(prisma.business.findFirst).mockResolvedValue({
      id: "biz_1",
      phone: "+16195550000",
      inboundPath: "BOOKABLE_VOICEMAIL",
    } as never);
    vi.mocked(prisma.call.create).mockResolvedValue({ id: "call_1" } as never);
    vi.mocked(startBookableCall).mockResolvedValue({
      session: { id: "sess_1", knownCaller: false },
      prompt: { say: "Thanks for calling Spawkles. To book, press 1.", state: "menu", status: "IN_PROGRESS" },
      shopName: "Spawkles",
    } as never);
    vi.mocked(handleBookableDigit).mockResolvedValue({
      session: {
        id: "sess_1",
        bookingKind: null,
        calendarEventId: null,
        smsCustomerStatus: null,
        smsOwnerStatus: null,
      },
      prompt: {
        say: "For Bath, press 1.",
        state: "service",
        status: "IN_PROGRESS",
        gather: true,
      },
    } as never);
  });

  it("starts a keypad walkthrough", async () => {
    const response = await POST(
      new Request("http://localhost/api/voice/simulate", {
        method: "POST",
        body: JSON.stringify({ from: "+16195550100" }),
      }) as never
    );
    const payload = await response.json();
    expect(payload.sessionId).toBe("sess_1");
    expect(payload.say).toContain("press 1");
    expect(payload.say).not.toMatch(/\bAI\b|virtual receptionist|\bassistant\b/i);
  });

  it("steps an existing session with a digit", async () => {
    vi.mocked(prisma.bookableSession.findUnique).mockResolvedValue({
      id: "sess_1",
    } as never);

    const response = await POST(
      new Request("http://localhost/api/voice/simulate", {
        method: "POST",
        body: JSON.stringify({ sessionId: "sess_1", digit: "1" }),
      }) as never
    );
    const payload = await response.json();
    expect(handleBookableDigit).toHaveBeenCalled();
    expect(payload.state).toBe("service");
  });
});
