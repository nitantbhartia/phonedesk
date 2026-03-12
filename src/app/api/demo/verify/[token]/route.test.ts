import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    demoMagicToken: {
      findUnique: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { GET } from "./route";

describe("GET /api/demo/verify/[token]", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T18:00:00.000Z"));
    vi.mocked(prisma.demoMagicToken.findUnique).mockReset();
  });

  it("redirects invalid tokens to the error page", async () => {
    vi.mocked(prisma.demoMagicToken.findUnique).mockResolvedValue(null);

    const response = await GET(new Request("http://localhost") as never, {
      params: Promise.resolve({ token: "bad" }),
    });

    expect(response.headers.get("location")).toBe("https://app.example.com/demo?error=invalid_token");
  });

  it("redirects valid tokens to the confirmation page without consuming them", async () => {
    vi.mocked(prisma.demoMagicToken.findUnique).mockResolvedValue({
      token: "magic_123",
      usedAt: null,
      expiresAt: new Date("2026-03-12T19:00:00.000Z"),
    } as never);

    const response = await GET(new Request("http://localhost") as never, {
      params: Promise.resolve({ token: "magic_123" }),
    });

    expect(response.headers.get("location")).toBe("https://app.example.com/demo/confirm?t=magic_123");
  });
});
