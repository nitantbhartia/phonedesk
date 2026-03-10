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
    },
    call: {
      findMany: vi.fn(),
      count: vi.fn(),
    },
  },
}));

import { GET } from "./route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

describe("GET /api/calls", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.call.findMany).mockReset();
    vi.mocked(prisma.call.count).mockReset();
  });

  it("returns unauthorized without a session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);

    const response = await GET(
      new Request("http://localhost/api/calls") as never
    );

    expect(response.status).toBe(401);
  });

  it("returns an empty list when the user has no business", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue(null);

    const response = await GET(
      new Request("http://localhost/api/calls") as never
    );

    await expect(response.json()).resolves.toEqual({ calls: [] });
  });

  it("filters by status and search terms and returns paginated calls", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);
    vi.mocked(prisma.call.findMany).mockResolvedValue([{ id: "call_1" }] as never);
    vi.mocked(prisma.call.count).mockResolvedValue(1);

    const response = await GET(
      new Request(
        "http://localhost/api/calls?limit=10&offset=20&status=NO_BOOKING&search=jamie"
      ) as never
    );
    const payload = await response.json();

    expect(prisma.call.findMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        status: "NO_BOOKING",
        OR: [
          { callerName: { contains: "jamie", mode: "insensitive" } },
          { callerPhone: { contains: "jamie" } },
          { transcript: { contains: "jamie", mode: "insensitive" } },
          { summary: { contains: "jamie", mode: "insensitive" } },
        ],
      },
      include: {
        appointment: {
          select: {
            petName: true,
            serviceName: true,
            startTime: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      skip: 20,
    });
    expect(prisma.call.count).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        status: "NO_BOOKING",
        OR: expect.any(Array),
      },
    });
    expect(payload).toEqual({ calls: [{ id: "call_1" }], total: 1 });
  });
});
