import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicDemoAttempt: {
      findUnique: vi.fn(),
    },
    call: {
      findFirst: vi.fn(),
    },
  },
}));

import { GET } from "./route";
import { prisma } from "@/lib/prisma";

describe("GET /api/demo/public/status", () => {
  beforeEach(() => {
    process.env.DEMO_BUSINESS_ID = "demo_biz";
    vi.mocked(prisma.publicDemoAttempt.findUnique).mockReset();
    vi.mocked(prisma.call.findFirst).mockReset();
  });

  it("uses the attempt caller phone to find the matching demo call", async () => {
    vi.mocked(prisma.publicDemoAttempt.findUnique).mockResolvedValue({
      sessionToken: "token_1",
      startedAt: new Date("2026-03-11T22:00:00.000Z"),
      callerPhone: "+16195550100",
    } as never);
    vi.mocked(prisma.call.findFirst).mockResolvedValue({
      status: "IN_PROGRESS",
      summary: null,
    } as never);

    const response = await GET(
      {
        nextUrl: new URL("http://localhost/api/demo/public/status?token=token_1"),
      } as never
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.call.findFirst).toHaveBeenCalledWith({
      where: {
        businessId: "demo_biz",
        createdAt: { gte: new Date("2026-03-11T22:00:00.000Z") },
        OR: [
          { callerPhone: "+16195550100" },
          { callerPhone: "+16195550100" },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    expect(payload.phase).toBe("in_progress");
  });
});
