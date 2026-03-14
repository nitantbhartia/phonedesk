import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: {
      findFirst: vi.fn(),
    },
    demoSession: {
      findFirst: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/retell-auth", () => ({
  isRetellWebhookValid: vi.fn(),
}));

vi.mock("@/crm/withFallback", () => ({
  getCRMWithFallback: vi.fn(),
}));

vi.mock("@/lib/demo-session", () => ({
  resolveBusinessFromDemo: vi.fn(),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { getCRMWithFallback } from "@/crm/withFallback";

function makeRequest(body: unknown, signature = "sig") {
  return new Request("http://localhost/api/retell/add-call-note", {
    method: "POST",
    headers: { "content-type": "application/json", "x-retell-signature": signature },
    body: JSON.stringify(body),
  });
}

describe("POST /api/retell/add-call-note", () => {
  beforeEach(() => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(true);
    vi.mocked(prisma.phoneNumber.findFirst).mockReset();
    vi.mocked(prisma.demoSession.findFirst).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.customer.findFirst).mockReset();
    vi.mocked(prisma.customer.updateMany).mockReset();
    vi.mocked(getCRMWithFallback).mockReset();
  });

  it("rejects unauthorized requests", async () => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(false);

    const response = await POST(makeRequest({ args: {}, call: {} }) as never);

    expect(response.status).toBe(401);
  });

  it("skips empty notes", async () => {
    const response = await POST(
      makeRequest({ args: { outcome: "no_booking" }, call: {} }) as never
    );
    const payload = await response.json();

    expect(payload.result).toBe("Note skipped — no content provided.");
    expect(prisma.customer.updateMany).not.toHaveBeenCalled();
  });

  it("returns a fallback when the business cannot be resolved", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);

    const response = await POST(
      makeRequest({
        args: { note: "Caller asked about pricing." },
        call: { to_number: "+16195559999" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.result).toBe("Call note skipped — business not resolved.");
  });

  it("writes both CRM and internal customer notes when data is available", async () => {
    const addNote = vi.fn(async () => undefined);
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: { id: "biz_1" },
    } as never);
    vi.mocked(getCRMWithFallback).mockResolvedValue({
      getCRMType: () => "square",
      addNote,
    } as never);

    const response = await POST(
      makeRequest({
        args: {
          square_customer_id: "sq_123",
          outcome: "booked",
          note: "Booked a full groom for Buddy.",
        },
        call: {
          to_number: "+16195559999",
          from_number: "(619) 555-0100",
        },
      }) as never
    );
    const payload = await response.json();

    expect(addNote).toHaveBeenCalledWith(
      "sq_123",
      expect.stringContaining("[PawAnswers] booked")
    );
    expect(prisma.customer.updateMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        phone: "+16195550100",
      },
      data: {
        lastCallSummary: "Booked a full groom for Buddy.",
        lastContactAt: expect.any(Date),
        lastOutcome: "booked",
      },
    });
    expect(payload.result).toBe("Call note saved.");
  });

  it("keeps saving internal history when CRM note creation fails", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: { id: "biz_1" },
    } as never);
    vi.mocked(getCRMWithFallback).mockResolvedValue({
      getCRMType: () => "square",
      addNote: vi.fn(async () => {
        throw new Error("crm down");
      }),
    } as never);

    const response = await POST(
      makeRequest({
        args: {
          square_customer_id: "sq_123",
          outcome: "inquiry_only",
          note: "Asked about pricing only.",
        },
        call: {
          to_number: "+16195559999",
          from_number: "+16195550100",
        },
      }) as never
    );
    const payload = await response.json();

    expect(prisma.customer.updateMany).toHaveBeenCalled();
    expect(payload.result).toBe("Call note saved.");
  });

  it("uses the customer number for outbound MoeGo calls when writing notes and internal history", async () => {
    const addNote = vi.fn(async () => undefined);
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: { id: "biz_1" },
    } as never);
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({
      moegoCustomerId: "moego_123",
    } as never);
    vi.mocked(getCRMWithFallback).mockResolvedValue({
      getCRMType: () => "moego",
      addNote,
    } as never);

    const response = await POST(
      makeRequest({
        args: {
          outcome: "voicemail",
          note: "Left a quick rebooking voicemail.",
        },
        call: {
          direction: "outbound",
          to_number: "+16195550100",
          from_number: "+16195559999",
        },
      }) as never
    );
    const payload = await response.json();

    expect(prisma.customer.findFirst).toHaveBeenCalledWith({
      where: { businessId: "biz_1", phone: "+16195550100" },
      select: { moegoCustomerId: true },
    });
    expect(addNote).toHaveBeenCalledWith(
      "moego_123",
      expect.stringContaining("[PawAnswers] voicemail")
    );
    expect(prisma.customer.updateMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        phone: "+16195550100",
      },
      data: {
        lastCallSummary: "Left a quick rebooking voicemail.",
        lastContactAt: expect.any(Date),
        lastOutcome: "voicemail",
      },
    });
    expect(payload.result).toBe("Call note saved.");
  });
});
