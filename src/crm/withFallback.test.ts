import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./registry", () => ({
  getCRMForBusiness: vi.fn(),
}));

vi.mock("./PawAnswersDBAdapter", () => ({
  PawAnswersDBAdapter: vi.fn().mockImplementation((businessId: string) => ({
    businessId,
    getCRMType: () => "pawanswers",
  })),
}));

import { getCRMForBusiness } from "./registry";
import { PawAnswersDBAdapter } from "./PawAnswersDBAdapter";
import { getCRMWithFallback } from "./withFallback";

describe("crm with fallback", () => {
  beforeEach(() => {
    vi.mocked(getCRMForBusiness).mockReset();
  });

  it("returns the original adapter when it is already the fallback", async () => {
    const crm = { getCRMType: () => "pawanswers" };
    vi.mocked(getCRMForBusiness).mockResolvedValue(crm as never);

    await expect(getCRMWithFallback("biz_1")).resolves.toBe(crm);
  });

  it("keeps the external crm when healthCheck passes", async () => {
    const crm = { getCRMType: () => "square", healthCheck: vi.fn().mockResolvedValue(true) };
    vi.mocked(getCRMForBusiness).mockResolvedValue(crm as never);

    await expect(getCRMWithFallback("biz_1")).resolves.toBe(crm);
  });

  it("falls back when the external crm is unhealthy", async () => {
    const crm = { getCRMType: () => "square", healthCheck: vi.fn().mockResolvedValue(false) };
    vi.mocked(getCRMForBusiness).mockResolvedValue(crm as never);

    await getCRMWithFallback("biz_1");

    expect(PawAnswersDBAdapter).toHaveBeenCalledWith("biz_1");
  });
});
