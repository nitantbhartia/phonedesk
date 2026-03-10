import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/retell-auth", () => ({
  isRetellWebhookValid: vi.fn(),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { isRetellWebhookValid } from "@/lib/retell-auth";

function makeRequest(body: unknown, signature = "sig") {
  return new Request("http://localhost/api/retell/get-quote", {
    method: "POST",
    headers: { "content-type": "application/json", "x-retell-signature": signature },
    body: JSON.stringify(body),
  });
}

describe("POST /api/retell/get-quote", () => {
  beforeEach(() => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(true);
    vi.mocked(prisma.phoneNumber.findFirst).mockReset();
  });

  it("rejects unauthorized requests", async () => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(false);

    const response = await POST(makeRequest({ args: {}, call: {} }) as never);

    expect(response.status).toBe(401);
  });

  it("returns a fallback response when the business cannot be resolved", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);

    const response = await POST(
      makeRequest({ args: { service_name: "Bath" }, call: { to_number: "+16195559999" } }) as never
    );
    const payload = await response.json();

    expect(payload.found).toBe(false);
    expect(payload.result).toContain("having trouble pulling up pricing");
  });

  it("prompts for clarification when the service name does not match", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: {
        services: [
          { name: "Bath", price: 45, duration: 60, isActive: true },
          { name: "Full Groom", price: 95, duration: 90, isActive: true },
        ],
      },
    } as never);

    const response = await POST(
      makeRequest({ args: { service_name: "teeth" }, call: { to_number: "+16195559999" } }) as never
    );
    const payload = await response.json();

    expect(payload.found).toBe(false);
    expect(payload.result).toContain("Bath ($45)");
    expect(payload.result).toContain("Full Groom ($95)");
  });

  it("returns the matched service quote", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: {
        services: [
          { name: "Full Groom", price: 95, duration: 90, isActive: true },
        ],
      },
    } as never);

    const response = await POST(
      makeRequest({ args: { service_name: "groom" }, call: { to_number: "+16195559999" } }) as never
    );
    const payload = await response.json();

    expect(payload).toEqual({
      result:
        "Full Groom is $95 and usually takes about 90 minutes. Want me to check availability for that service?",
      found: true,
      service_name: "Full Groom",
      price: 95,
      duration_minutes: 90,
    });
  });
});
