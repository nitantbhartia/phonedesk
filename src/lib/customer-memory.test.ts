import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./prisma", () => ({
  prisma: {
    appointment: {
      count: vi.fn(),
    },
    customer: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
    },
    pet: {
      upsert: vi.fn(),
    },
    behaviorLog: {
      findMany: vi.fn(),
    },
  },
}));

import {
  buildCustomerContextSummary,
  deduplicatePets,
  lookupCustomerContext,
  upsertCustomerMemory,
  upsertCustomerMemoryFromCall,
} from "./customer-memory";
import { prisma } from "./prisma";

describe("buildCustomerContextSummary", () => {
  beforeEach(() => {
    vi.mocked(prisma.appointment.count).mockReset();
    vi.mocked(prisma.customer.upsert).mockReset();
    vi.mocked(prisma.customer.findUnique).mockReset();
    vi.mocked(prisma.pet.upsert).mockReset();
    vi.mocked(prisma.behaviorLog.findMany).mockReset();
  });

  it("returns new-customer guidance when no customer exists", () => {
    const summary = buildCustomerContextSummary({
      found: false,
      normalizedPhone: "+16195550100",
      customer: null,
      pets: [],
      behaviorLogs: [],
    });

    expect(summary).toContain("No prior customer record found");
  });

  it("returns detailed returning-customer context", () => {
    const summary = buildCustomerContextSummary({
      found: true,
      normalizedPhone: "+16195550100",
      customer: {
        id: "cust_1",
        businessId: "biz_1",
        phone: "+16195550100",
        name: "Sarah",
        squareCustomerId: null,
        moegoCustomerId: null,
        smsOptOut: false,
        visitCount: 8,
        vipFlag: false,
        notes: "Dog gets anxious during nail trims",
        lastServiceName: "Full Groom",
        lastVisitAt: new Date("2026-02-12T10:00:00.000Z"),
        lastContactAt: new Date("2026-03-01T18:00:00.000Z"),
        lastCallSummary: "Asked about next availability",
        lastOutcome: "NO_BOOKING",
        noShowCount: 0,
        preferredGroomerId: null,
        preferredGroomer: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        pets: [],
      },
      pets: [
        {
          id: "pet_1",
          customerId: "cust_1",
          name: "Buddy",
          breed: "Golden Retriever",
          size: "LARGE",
          notes: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      behaviorLogs: [],
    });

    expect(summary).toContain("Returning customer found.");
    expect(summary).toContain("Customer name: Sarah.");
    expect(summary).toContain("Pets on file: Buddy, Golden Retriever, LARGE.");
    expect(summary).toContain("Last service: Full Groom.");
  });

  it("deduplicates pet name variants using the richer record", () => {
    const pets = deduplicatePets([
      { name: "Rexi", breed: null, size: null, notes: null },
      { name: "Rexie", breed: "Poodle", size: "SMALL", notes: null },
      { name: "Bella", breed: "Doodle", size: null, notes: null },
    ]);

    expect(pets).toEqual([
      { name: "Rexie", breed: "Poodle", size: "SMALL", notes: null },
      { name: "Bella", breed: "Doodle", size: null, notes: null },
    ]);
  });

  it("upserts booking memory and creates a pet profile when the phone normalizes", async () => {
    vi.mocked(prisma.appointment.count).mockResolvedValue(3);
    vi.mocked(prisma.customer.upsert).mockResolvedValue({ id: "cust_1" } as never);

    const result = await upsertCustomerMemory({
      businessId: "biz_1",
      customerName: "Jamie",
      customerPhone: "(619) 555-0100",
      petName: "Bella",
      petBreed: "Poodle",
      petSize: "SMALL",
      serviceName: "Full Groom",
      appointmentStart: new Date("2026-03-12T18:00:00.000Z"),
    });

    expect(result).toEqual({ id: "cust_1" });
    expect(prisma.customer.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          businessId_phone: {
            businessId: "biz_1",
            phone: "+16195550100",
          },
        },
      })
    );
    expect(prisma.pet.upsert).toHaveBeenCalled();
  });

  it("returns null and skips writes when the phone is invalid", async () => {
    const result = await upsertCustomerMemoryFromCall({
      businessId: "biz_1",
      customerName: "Jamie",
      customerPhone: "invalid",
      contactedAt: new Date("2026-03-12T18:00:00.000Z"),
    });

    expect(result).toBeNull();
    expect(prisma.customer.upsert).not.toHaveBeenCalled();
  });

  it("looks up pets and behavior logs for a known customer", async () => {
    vi.mocked(prisma.customer.findUnique).mockResolvedValue({
      id: "cust_1",
      pets: [{ id: "pet_1", name: "Bella" }],
      preferredGroomer: { name: "Alex" },
    } as never);
    vi.mocked(prisma.behaviorLog.findMany).mockResolvedValue([
      {
        severity: "HIGH_RISK",
        petName: "Bella",
        note: "Needs muzzle for dryer",
        tags: ["dryer"],
      },
    ] as never);

    const context = await lookupCustomerContext("biz_1", "(619) 555-0100");
    const summary = buildCustomerContextSummary(context);

    expect(context.found).toBe(true);
    expect(prisma.behaviorLog.findMany).toHaveBeenCalled();
    expect(summary).toContain("WARNING: This pet has been flagged as high-risk.");
    expect(summary).toContain("Preferred groomer: Alex.");
  });
});
