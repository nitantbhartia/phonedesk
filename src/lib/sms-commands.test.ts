import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockGenerateContent } = vi.hoisted(() => ({
  mockGenerateContent: vi.fn(),
}));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: mockGenerateContent,
    };
  },
}));

vi.mock("./prisma", () => ({
  prisma: {
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    appointment: {
      create: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    service: {
      create: vi.fn(),
    },
    customer: {
      findFirst: vi.fn(),
    },
    behaviorLog: {
      create: vi.fn(),
    },
  },
}));

vi.mock("./sms", () => ({
  sendSms: vi.fn(),
}));

import { prisma } from "./prisma";
import { sendSms } from "./sms";
import { executeCommand, parseOwnerCommand } from "./sms-commands";

const baseBusiness = {
  id: "biz_1",
  name: "Paw House",
  timezone: "America/Los_Angeles",
  businessHours: { mon: { open: "09:00", close: "17:00" } },
  isActive: true,
  address: "123 Main St",
  services: [
    { id: "svc_1", name: "Bath", price: 45, isActive: true },
    { id: "svc_2", name: "Full Groom", price: 95, isActive: true },
  ],
  phoneNumber: { number: "+16195559999" },
  appointments: [],
};

describe("parseOwnerCommand", () => {
  beforeEach(() => {
    process.env.GEMINI_API_KEY = "test-key";
    mockGenerateContent.mockReset();
  });

  it("parses structured JSON from Gemini", async () => {
    mockGenerateContent.mockResolvedValue({
      text: JSON.stringify({
        intent: "pause_bookings",
        entities: {},
      }),
    });

    const result = await parseOwnerCommand("Pause bookings");

    expect(result).toEqual({ intent: "pause_bookings", entities: {} });
    expect(mockGenerateContent).toHaveBeenCalledWith(
      expect.objectContaining({
        model: expect.any(String),
        contents: expect.stringContaining("Pause bookings"),
      })
    );
  });

  it("falls back to unknown when Gemini returns invalid JSON", async () => {
    mockGenerateContent.mockResolvedValue({
      text: "not-json",
    });

    const result = await parseOwnerCommand("???");

    expect(result).toEqual({ intent: "unknown", entities: {} });
  });
});

describe("executeCommand", () => {
  beforeEach(() => {
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_PHONE_NUMBER;

    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.business.update).mockReset();
    vi.mocked(prisma.appointment.create).mockReset();
    vi.mocked(prisma.appointment.findMany).mockReset();
    vi.mocked(prisma.appointment.findFirst).mockReset();
    vi.mocked(prisma.appointment.update).mockReset();
    vi.mocked(prisma.service.create).mockReset();
    vi.mocked(prisma.customer.findFirst).mockReset();
    vi.mocked(prisma.behaviorLog.create).mockReset();
    vi.mocked(sendSms).mockReset();

    vi.mocked(prisma.business.findUnique).mockResolvedValue(baseBusiness as never);
  });

  it("returns early when the business cannot be found", async () => {
    vi.mocked(prisma.business.findUnique).mockResolvedValue(null);

    const result = await executeCommand(
      "biz_missing",
      { intent: "pause_bookings", entities: {} },
      "+16195550000",
      "+16195559999"
    );

    expect(result).toBe("Business not found.");
    expect(sendSms).not.toHaveBeenCalled();
  });

  it("adds a service and confirms back to the owner", async () => {
    const result = await executeCommand(
      "biz_1",
      { intent: "add_service", entities: { name: "Puppy Bath", price: "55" } },
      "+16195550000",
      "+16195559999"
    );

    expect(prisma.service.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz_1",
        name: "Puppy Bath",
        price: 55,
        duration: 60,
      },
    });
    expect(sendSms).toHaveBeenCalledWith(
      "+16195550000",
      '[RingPaw] Added "Puppy Bath" at $55 to your services. Your AI agent will now offer this to callers.',
      "+16195559999"
    );
    expect(result).toContain('Added "Puppy Bath"');
  });

  it("updates business hours across a day range and replies with the merged schedule change", async () => {
    const result = await executeCommand(
      "biz_1",
      {
        intent: "update_hours",
        entities: { hours: "9am-5pm", days: "Mon-Wed" },
      },
      "+16195550000",
      "+16195559999"
    );

    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { id: "biz_1" },
      data: {
        businessHours: {
          mon: { open: "09:00", close: "17:00" },
          tue: { open: "09:00", close: "17:00" },
          wed: { open: "09:00", close: "17:00" },
        },
      },
    });
    expect(result).toContain("Business hours updated to 9am-5pm");
    expect(sendSms).toHaveBeenCalledWith(
      "+16195550000",
      expect.stringContaining("[RingPaw] Business hours updated"),
      "+16195559999"
    );
  });

  it("shows the current schedule for the requested day", async () => {
    vi.mocked(prisma.appointment.findMany).mockResolvedValue([
      {
        startTime: new Date("2026-05-21T16:00:00.000Z"),
        petName: "Buddy",
        customerName: "Jamie",
        serviceName: "Full Groom",
      },
    ] as never);

    const result = await executeCommand(
      "biz_1",
      { intent: "show_schedule", entities: { date: "today" } },
      "+16195550000",
      "+16195559999"
    );

    expect(prisma.appointment.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          businessId: "biz_1",
          status: { in: ["CONFIRMED", "PENDING"] },
        }),
      })
    );
    expect(result).toContain("Today's schedule:");
    expect(result).toContain("Buddy (Jamie) - Full Groom");
  });

  it("cancels an appointment, texts the customer, and confirms to the owner", async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: "appt_1",
      customerName: "Jamie",
      customerPhone: "+16195550100",
      startTime: new Date("2026-05-21T16:00:00.000Z"),
    } as never);

    const result = await executeCommand(
      "biz_1",
      {
        intent: "cancel_appointment",
        entities: { customerName: "Jamie" },
      },
      "+16195550000",
      "+16195559999"
    );

    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_1" },
      data: { status: "CANCELLED" },
    });
    expect(sendSms).toHaveBeenNthCalledWith(
      1,
      "+16195550100",
      "Hi Jamie, your appointment at Paw House has been cancelled. Please call us to reschedule.",
      "+16195559999"
    );
    expect(sendSms).toHaveBeenNthCalledWith(
      2,
      "+16195550000",
      expect.stringContaining("[RingPaw] Cancelled Jamie's appointment"),
      "+16195559999"
    );
    expect(result).toContain("Cancelled Jamie's appointment");
  });

  it("records a behavior note with severity and detected tags", async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: "appt_2",
      customerPhone: "+16195550100",
    } as never);
    vi.mocked(prisma.customer.findFirst).mockResolvedValue({
      id: "cust_1",
      pets: [{ id: "pet_1", name: "Buddy" }],
    } as never);

    const result = await executeCommand(
      "biz_1",
      {
        intent: "behavior_note",
        entities: {
          petName: "Buddy",
          note: "Anxious today, needed muzzle and was nervous for nails.",
        },
      },
      "+16195550000",
      "+16195559999"
    );

    expect(prisma.behaviorLog.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz_1",
        petName: "Buddy",
        customerId: "cust_1",
        petId: "pet_1",
        appointmentId: "appt_2",
        severity: "CAUTION",
        note: "Anxious today, needed muzzle and was nervous for nails.",
        tags: ["muzzle_required", "anxious", "nervous"],
      },
    });
    expect(result).toContain("flagged CAUTION");
  });

  it("marks a pet ready for pickup and notifies the customer", async () => {
    vi.mocked(prisma.appointment.findFirst).mockResolvedValue({
      id: "appt_3",
      petName: "Buddy",
      customerPhone: "+16195550100",
    } as never);

    const result = await executeCommand(
      "biz_1",
      {
        intent: "finish_grooming",
        entities: { petName: "Buddy" },
      },
      "+16195550000",
      "+16195559999"
    );

    expect(prisma.appointment.update).toHaveBeenCalledWith({
      where: { id: "appt_3" },
      data: {
        groomingStatus: "READY_FOR_PICKUP",
        groomingStatusAt: expect.any(Date),
        pickupNotifiedAt: expect.any(Date),
      },
    });
    expect(sendSms).toHaveBeenNthCalledWith(
      1,
      "+16195550100",
      "Buddy is all done and looking fabulous! Head to 123 Main St for pickup.",
      "+16195559999"
    );
    expect(sendSms).toHaveBeenNthCalledWith(
      2,
      "+16195550000",
      expect.stringContaining("[RingPaw] Buddy is ready for pickup."),
      "+16195559999"
    );
    expect(result).toContain("Buddy is ready for pickup");
  });
});
