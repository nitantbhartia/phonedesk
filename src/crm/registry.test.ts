import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    calendarConnection: {
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("./PawAnswersDBAdapter", () => ({
  PawAnswersDBAdapter: vi.fn().mockImplementation((businessId: string) => ({
    businessId,
    getCRMType: () => "pawanswers",
  })),
}));

vi.mock("./adapters/SquareAdapter", () => ({
  SquareAdapter: vi.fn().mockImplementation((token: string, locationId: string, baseUrl: string) => ({
    token,
    locationId,
    baseUrl,
    getCRMType: () => "square",
  })),
}));

import { prisma } from "@/lib/prisma";
import { PawAnswersDBAdapter } from "./PawAnswersDBAdapter";
import { getCRMForBusiness } from "./registry";

describe("crm registry", () => {
  beforeEach(() => {
    vi.mocked(prisma.calendarConnection.findFirst).mockReset();
    delete process.env.SQUARE_ENVIRONMENT;
  });

  it("returns a square adapter when there is an active square connection", async () => {
    vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue({
      accessToken: "token_123",
      metadata: { locationId: "loc_1" },
    } as never);

    const crm = await getCRMForBusiness("biz_1");

    expect(crm.getCRMType()).toBe("square");
  });

  it("falls back to the internal adapter when no external crm is connected", async () => {
    vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue(null);

    await getCRMForBusiness("biz_1");

    expect(PawAnswersDBAdapter).toHaveBeenCalledWith("biz_1");
  });
});
