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
  return new Request("http://localhost/api/retell/current-datetime", {
    method: "POST",
    headers: { "content-type": "application/json", "x-retell-signature": signature },
    body: JSON.stringify(body),
  });
}

describe("POST /api/retell/current-datetime", () => {
  beforeEach(() => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(true);
    vi.mocked(prisma.phoneNumber.findFirst).mockReset();
  });

  it("rejects unauthorized requests", async () => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(false);

    const response = await POST(makeRequest({ call: {} }) as never);

    expect(response.status).toBe(401);
  });

  it("returns a timezone-aware datetime response for the matched business", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: { timezone: "America/New_York" },
    } as never);

    const response = await POST(
      makeRequest({ call: { to_number: "+16195559999" } }) as never
    );
    const payload = await response.json();

    expect(payload.timezone).toBe("America/New_York");
    expect(payload.result).toContain("America/New_York");
    expect(payload.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});
