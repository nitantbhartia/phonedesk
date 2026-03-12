import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: {
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/stripe", () => ({
  getStripeClient: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { getStripeClient } from "@/lib/stripe";
import { ensureStripeCustomerForBusiness } from "./stripe-billing";

describe("stripe-billing", () => {
  const retrieve = vi.fn();
  const list = vi.fn();
  const create = vi.fn();

  beforeEach(() => {
    vi.mocked(prisma.business.update).mockReset();
    retrieve.mockReset();
    list.mockReset();
    create.mockReset();
    vi.mocked(getStripeClient).mockReturnValue({
      customers: {
        retrieve,
        list,
        create,
      },
    } as never);
  });

  it("reuses an existing active stripe customer", async () => {
    retrieve.mockResolvedValue({ id: "cus_1" });

    const result = await ensureStripeCustomerForBusiness({
      businessId: "biz_1",
      businessName: "Paw House",
      stripeCustomerId: "cus_1",
    });

    expect(result).toBe("cus_1");
    expect(prisma.business.update).not.toHaveBeenCalled();
  });

  it("finds a customer by email/metadata before creating a new one", async () => {
    list.mockResolvedValue({
      data: [
        { id: "cus_other", metadata: { businessId: "other" } },
        { id: "cus_match", metadata: { businessId: "biz_1" } },
      ],
    });

    const result = await ensureStripeCustomerForBusiness({
      businessId: "biz_1",
      businessName: "Paw House",
      businessEmail: "owner@example.com",
    });

    expect(result).toBe("cus_match");
    expect(create).not.toHaveBeenCalled();
    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: { stripeCustomerId: "cus_match" },
    });
  });

  it("creates and persists a new customer when none exists", async () => {
    list.mockResolvedValue({ data: [] });
    create.mockResolvedValue({ id: "cus_new" });

    const result = await ensureStripeCustomerForBusiness({
      businessId: "biz_1",
      businessName: "Paw House",
      businessEmail: "owner@example.com",
    });

    expect(result).toBe("cus_new");
    expect(create).toHaveBeenCalledWith({
      email: "owner@example.com",
      name: "Paw House",
      metadata: { businessId: "biz_1" },
    });
  });
});
