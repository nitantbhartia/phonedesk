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

  it("returns mapped pets and services from the local database", async () => {
    vi.mocked(prisma.pet.findMany).mockResolvedValue([
      {
        id: "pet_1",
        customerId: "cust_1",
        name: "Bella",
        breed: "Poodle",
        size: "SMALL",
        notes: "Anxious for nails",
      },
    ] as never);
    vi.mocked(prisma.service.findMany).mockResolvedValue([
      {
        id: "svc_1",
        name: "Bath",
        price: 45,
        duration: 60,
        isActive: true,
      },
    ] as never);

    await expect(adapter.getPets("cust_1")).resolves.toEqual([
      {
        id: "pet_1",
        customerId: "cust_1",
        name: "Bella",
        breed: "Poodle",
        size: "SMALL",
        temperamentNotes: "Anxious for nails",
      },
    ]);
    await expect(adapter.getServices()).resolves.toEqual([
      {
        id: "svc_1",
        name: "Bath",
        priceCents: 4500,
        durationMinutes: 60,
        active: true,
      },
    ]);
  });

  it("supports addNote, healthCheck, and CRM metadata helpers", async () => {
    await adapter.addNote("cust_1", "Asked for a shorter cut");

    expect(prisma.customer.update).toHaveBeenCalledWith({
      where: { id: "cust_1" },
      data: { lastCallSummary: "Asked for a shorter cut" },
    });
    await expect(adapter.healthCheck()).resolves.toBe(true);
    expect(adapter.getCRMType()).toBe("pawanswers");
  });
});
