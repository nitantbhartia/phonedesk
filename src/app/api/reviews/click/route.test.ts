import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    reviewRequest: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
  },
}));

import { prisma } from "@/lib/prisma";
import { GET } from "./route";

describe("GET /api/reviews/click", () => {
  beforeEach(() => {
    vi.mocked(prisma.reviewRequest.findUnique).mockReset();
    vi.mocked(prisma.reviewRequest.update).mockReset();
  });

  it("returns 400 when the review request id is missing", async () => {
    const response = await GET(new Request("http://localhost/api/reviews/click") as never);

    expect(response.status).toBe(400);
  });

  it("tracks the click and redirects to the business review URL", async () => {
    vi.mocked(prisma.reviewRequest.findUnique).mockResolvedValue({
      id: "review_1",
      business: { googleReviewUrl: "https://google.example/review" },
    } as never);
    vi.mocked(prisma.reviewRequest.update).mockResolvedValue({ id: "review_1" } as never);

    const response = await GET(
      new Request("http://localhost/api/reviews/click?id=review_1") as never
    );

    expect(prisma.reviewRequest.update).toHaveBeenCalledWith({
      where: { id: "review_1" },
      data: {
        clicked: true,
        clickedAt: expect.any(Date),
      },
    });
    expect(response.headers.get("location")).toBe("https://google.example/review");
  });
});
