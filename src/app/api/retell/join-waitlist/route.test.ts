import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: {
      findFirst: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
    waitlistEntry: {
      create: vi.fn(),
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
  timezone: "America/Los_Angeles",
  phoneNumber: { number: "+16195559999" },
  services: [],
};

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/retell/join-waitlist", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-retell-signature": "sig",
    },
    body: JSON.stringify(body),
  });
}

describe("POST /api/retell/join-waitlist", () => {
  beforeEach(() => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(true);
    vi.mocked(prisma.phoneNumber.findFirst).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.waitlistEntry.create).mockReset();

    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: businessRecord,
    } as never);
  });

  it("rejects unauthorized requests", async () => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(false);

    const response = await POST(makeRequest({ args: {}, call: {} }) as never);

    expect(response.status).toBe(401);
  });

  it("creates a waitlist entry using the caller number when no customer phone is provided", async () => {
    vi.mocked(prisma.waitlistEntry.create).mockResolvedValue({
      id: "wait_1",
    } as never);

    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Jamie",
          pet_name: "Buddy",
          service_name: "Full Groom",
          preferred_date: "2026-05-28",
          preferred_time: "afternoon",
        },
        call: { to_number: "+16195559999", from_number: "(619) 555-0100" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.waitlisted).toBe(true);
    expect(prisma.waitlistEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: "biz_1",
        customerName: "Jamie",
        customerPhone: "+16195550100",
        petName: "Buddy",
        serviceName: "Full Groom",
        preferredTime: "afternoon",
      }),
    });
  });

  it("returns a validation message for an unclear preferred date", async () => {
    const response = await POST(
      makeRequest({
        args: {
          customer_name: "Jamie",
          preferred_date: "sometime soon please",
        },
        call: { to_number: "+16195559999", from_number: "+16195550100" },
      }) as never
    );
    const payload = await response.json();

    expect(payload.waitlisted).toBe(false);
    expect(payload.result).toContain("didn't come through clearly");
    expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
  });
});
