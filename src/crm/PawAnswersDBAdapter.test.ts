import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    pet: {
      findMany: vi.fn(),
    },
    service: {
      findMany: vi.fn(),
    },
    customer: {
      upsert: vi.fn(),
      update: vi.fn(),
    },
  },
}));

vi.mock("@/lib/customer-memory", () => ({
  lookupCustomerContext: vi.fn(),
}));

vi.mock("@/lib/phone", () => ({
  normalizePhoneNumber: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { lookupCustomerContext } from "@/lib/customer-memory";
import { normalizePhoneNumber } from "@/lib/phone";
import { PawAnswersDBAdapter } from "./PawAnswersDBAdapter";

describe("PawAnswersDBAdapter", () => {
  const adapter = new PawAnswersDBAdapter("biz_1");

  beforeEach(() => {
    vi.mocked(lookupCustomerContext).mockReset();
    vi.mocked(prisma.pet.findMany).mockReset();
    vi.mocked(prisma.service.findMany).mockReset();
    vi.mocked(prisma.customer.upsert).mockReset();
    vi.mocked(prisma.customer.update).mockReset();
    vi.mocked(normalizePhoneNumber).mockReset();
  });

  it("maps customer context into a CRM customer", async () => {
    vi.mocked(lookupCustomerContext).mockResolvedValue({
      customer: {
        id: "cust_1",
        name: "Jamie",
        phone: "+16195550100",
        visitCount: 3,
        noShowCount: 1,
        vipFlag: true,
        createdAt: new Date("2026-01-01T00:00:00.000Z"),
      },
    } as never);

    await expect(adapter.getCustomer("+16195550100")).resolves.toMatchObject({
      id: "cust_1",
      name: "Jamie",
      vip: true,
    });
  });

  it("creates or updates customers using normalized phone numbers", async () => {
    vi.mocked(normalizePhoneNumber).mockReturnValue("+16195550100");
    vi.mocked(prisma.customer.upsert).mockResolvedValue({
      id: "cust_1",
      name: "Jamie",
      phone: "+16195550100",
      visitCount: 0,
      noShowCount: 0,
      vipFlag: false,
      createdAt: new Date("2026-01-01T00:00:00.000Z"),
    } as never);

    await expect(adapter.createCustomer({ name: "Jamie", phone: "(619) 555-0100" })).resolves.toMatchObject({
      id: "cust_1",
      phone: "+16195550100",
    });
  });
});
