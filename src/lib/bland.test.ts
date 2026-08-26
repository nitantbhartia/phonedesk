import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: { findUnique: vi.fn() },
  },
}));

import { configureInboundAgent } from "./bland";

const fetchMock = vi.fn();
vi.stubGlobal("fetch", fetchMock);

describe("Bland inbound configuration", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    fetchMock.mockReset();
    process.env.BLAND_API_KEY = "test-bland-key";
    process.env.BLAND_ENCRYPTED_TWILIO_KEY = "encrypted-twilio-key";
    process.env.BLAND_TOOL_SECRET = "tool-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://ringpaw.com";
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ status: "success" }), { status: 200 })
    );
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("updates the imported number at Bland's documented inbound endpoint", async () => {
    await configureInboundAgent({
      phone: "+16195550123",
      shop: {
        name: "Paws & Polish",
        phone: "+16195550124",
        timezone: "America/Los_Angeles",
        businessHours: { "mon-fri": { open: "09:00", close: "17:00" } },
        services: [
          {
            name: "Full groom",
            price: 85,
            duration: 60,
            isActive: true,
            isAddon: false,
          },
        ],
      } as never,
    });

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.bland.ai/v1/inbound/%2B16195550123");
    expect(url).not.toContain("/update");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toMatchObject({
      webhook: "https://ringpaw.com/api/bland/webhook",
      tools: expect.arrayContaining([
        expect.objectContaining({ name: "GetOpenings" }),
        expect.objectContaining({ name: "BookAppointment" }),
      ]),
    });
  });
});
