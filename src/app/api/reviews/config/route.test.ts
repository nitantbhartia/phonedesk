import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { GET, POST } from "./route";

describe("/api/reviews/config", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.business.update).mockReset();
  });

  it("returns the current review URL", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      googleReviewUrl: "https://google.example/review",
    } as never);

    const response = await GET();

    await expect(response.json()).resolves.toEqual({
      googleReviewUrl: "https://google.example/review",
    });
  });

  it("updates the review URL and allows clearing it", async () => {
    vi.mocked(getServerSession).mockResolvedValue({ user: { id: "user_1" } } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({ id: "biz_1" } as never);
    vi.mocked(prisma.business.update).mockResolvedValue({
      id: "biz_1",
      googleReviewUrl: null,
    } as never);

    const response = await POST(new Request("http://localhost/api/reviews/config", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ googleReviewUrl: "" }),
    }) as never);

    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: { googleReviewUrl: null },
      select: { id: true, googleReviewUrl: true },
    });
    await expect(response.json()).resolves.toEqual({ googleReviewUrl: null });
  });
});
