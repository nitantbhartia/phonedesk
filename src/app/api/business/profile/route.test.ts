import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      upsert: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    demoSession: {
      findUnique: vi.fn(),
    },
    demoLead: {
      findUnique: vi.fn(),
    },
    service: {
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    retellConfig: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    call: {
      count: vi.fn(),
      aggregate: vi.fn(),
    },
    appointment: {
      count: vi.fn(),
      findFirst: vi.fn(),
    },
  },
}));

vi.mock("@/lib/retell", () => ({
  syncRetellAgent: vi.fn(),
}));

vi.mock("@/lib/breed-recommendations", () => ({
  seedBreedRecommendations: vi.fn(),
}));

import { GET, PATCH, POST } from "./route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { syncRetellAgent } from "@/lib/retell";
import { seedBreedRecommendations } from "@/lib/breed-recommendations";

describe("business/profile", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.user.upsert).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.business.create).mockReset();
    vi.mocked(prisma.business.update).mockReset();
    vi.mocked(prisma.demoSession.findUnique).mockReset();
    vi.mocked(prisma.service.updateMany).mockReset();
    vi.mocked(prisma.service.create).mockReset();
    vi.mocked(prisma.retellConfig.upsert).mockReset();
    vi.mocked(prisma.retellConfig.updateMany).mockReset();
    vi.mocked(prisma.call.count).mockReset();
    vi.mocked(prisma.call.aggregate).mockReset();
    vi.mocked(prisma.appointment.count).mockReset();
    vi.mocked(prisma.appointment.findFirst).mockReset();
    vi.mocked(syncRetellAgent).mockReset();
    vi.mocked(seedBreedRecommendations).mockReset();
  });

  it("returns unauthorized on GET without a resolved user", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);

    const response = await GET();

    expect(response.status).toBe(401);
  });

  it("returns business profile stats on GET", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique)
      .mockResolvedValueOnce({
        id: "biz_1",
        services: [{ price: 50 }],
        groomers: [],
        phoneNumber: null,
        calendarConnections: [],
        retellConfig: null,
      } as never);
    vi.mocked(prisma.demoSession.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.call.count)
      .mockResolvedValueOnce(5)   // callsThisWeek
      .mockResolvedValueOnce(3)   // callsLastWeek
      .mockResolvedValueOnce(12)  // callsThisMonth
      .mockResolvedValueOnce(2);  // bookingsMissed (NO_BOOKING)
    vi.mocked(prisma.appointment.count)
      .mockResolvedValueOnce(4);  // bookingsConfirmed
    vi.mocked(prisma.call.aggregate)
      .mockResolvedValueOnce({ _avg: { duration: 83 } } as never)
      .mockResolvedValueOnce({ _sum: { duration: 600 } } as never);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValueOnce({
      petName: "Buddy",
      serviceName: "Full Groom",
      startTime: new Date("2026-04-01T10:00:00Z"),
      customerName: "Jane Doe",
    } as never);

    const response = await GET();
    const payload = await response.json();

    expect(payload.stats).toEqual({
      callsThisWeek: 5,
      callsLastWeek: 3,
      callsThisMonth: 12,
      bookingsConfirmed: 4,
      bookingsMissed: 2,
      revenueProtected: 200,
      avgCallDuration: 83,
      totalCallMinutes: 10,
      nextAppointment: {
        petName: "Buddy",
        serviceName: "Full Groom",
        startTime: "2026-04-01T10:00:00.000Z",
        customerName: "Jane Doe",
      },
    });
    expect(payload.demoPhoneNumber).toBeNull();
  });

  it("returns the active demo phone number when a live demo session exists", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValueOnce({
      id: "biz_1",
      services: [],
      groomers: [],
      phoneNumber: null,
      calendarConnections: [],
      retellConfig: null,
    } as never);
    vi.mocked(prisma.call.count)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(1)
      .mockResolvedValueOnce(0);
    vi.mocked(prisma.appointment.count).mockResolvedValueOnce(1);
    vi.mocked(prisma.call.aggregate)
      .mockResolvedValueOnce({ _avg: { duration: 120 } } as never)
      .mockResolvedValueOnce({ _sum: { duration: 300 } } as never);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValueOnce(null);
    vi.mocked(prisma.demoSession.findUnique).mockResolvedValue({
      expiresAt: new Date(Date.now() + 60_000),
      demoNumber: { number: "+16195550123" },
    } as never);

    const response = await GET();
    const payload = await response.json();

    expect(payload.demoPhoneNumber).toBe("+16195550123");
    expect(payload.stats.revenueProtected).toBe(65);
  });

  it("returns null nextAppointment when no upcoming appointments exist", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique)
      .mockResolvedValueOnce({
        id: "biz_1",
        services: [{ price: 50 }],
        groomers: [],
        phoneNumber: null,
        calendarConnections: [],
        retellConfig: null,
      } as never);
    vi.mocked(prisma.demoSession.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.call.count)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0)
      .mockResolvedValueOnce(0);
    vi.mocked(prisma.appointment.count).mockResolvedValueOnce(0);
    vi.mocked(prisma.call.aggregate)
      .mockResolvedValueOnce({ _avg: { duration: null } } as never)
      .mockResolvedValueOnce({ _sum: { duration: null } } as never);
    vi.mocked(prisma.appointment.findFirst).mockResolvedValueOnce(null);

    const response = await GET();
    const payload = await response.json();

    expect(payload.stats.nextAppointment).toBeNull();
    expect(payload.stats.callsLastWeek).toBe(0);
    expect(payload.stats.totalCallMinutes).toBe(0);
    expect(payload.stats.avgCallDuration).toBe(0);
  });

  it("returns demoLeadHint when business does not exist but demoLead does", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "lead@example.com", name: "Lead" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_2" } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValueOnce(null);
    vi.mocked(prisma.demoLead.findUnique).mockResolvedValueOnce({
      businessName: "Happy Paws",
    } as never);

    const response = await GET();
    const payload = await response.json();

    expect(payload.business).toBeNull();
    expect(payload.stats).toBeNull();
    expect(payload.demoLeadHint).toEqual({ businessName: "Happy Paws" });
  });

  it("creates a new business, seeds defaults, creates services, and syncs retell when config exists", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique)
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce({
        id: "biz_1",
        bookingMode: "SOFT",
        services: [{ name: "Bath", price: 45, isActive: true }],
        groomers: [],
        breedRecommendations: [],
        retellConfig: { agentId: "agent_1", llmId: "llm_1" },
      } as never);
    vi.mocked(prisma.business.create).mockResolvedValue({ id: "biz_1" } as never);

    const response = await POST(
      new Request("http://localhost/api/business/profile", {
        method: "POST",
        body: JSON.stringify({
          name: "Paw House",
          ownerName: "Taylor",
          services: [{ name: "Bath", price: "45", duration: "60" }],
          agentActive: true,
        }),
      }) as never
    );
    const payload = await response.json();

    expect(prisma.business.create).toHaveBeenCalled();
    expect(seedBreedRecommendations).toHaveBeenCalledWith("biz_1", prisma);
    expect(prisma.service.updateMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1" },
      data: { isActive: false },
    });
    expect(prisma.service.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz_1",
        name: "Bath",
        price: 45,
        duration: 60,
        isAddon: false,
      },
    });
    expect(prisma.retellConfig.upsert).toHaveBeenCalled();
    expect(syncRetellAgent).toHaveBeenCalled();
    expect(payload.synced).toBe(true);
  });

  it("requires name and ownerName when creating a new business", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValueOnce(null);

    const response = await POST(
      new Request("http://localhost/api/business/profile", {
        method: "POST",
        body: JSON.stringify({ name: "Paw House" }),
      }) as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "name and ownerName are required when creating a business profile",
    });
    expect(prisma.business.create).not.toHaveBeenCalled();
  });

  it("saves successfully without syncing when no retell config exists yet", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique)
      .mockResolvedValueOnce({ id: "biz_1" } as never)
      .mockResolvedValueOnce({
        id: "biz_1",
        bookingMode: "SOFT",
        services: [],
        groomers: [],
        breedRecommendations: [],
        retellConfig: null,
      } as never);
    vi.mocked(prisma.business.update).mockResolvedValue({ id: "biz_1" } as never);

    const response = await POST(
      new Request("http://localhost/api/business/profile", {
        method: "POST",
        body: JSON.stringify({ name: "Paw House Updated" }),
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(syncRetellAgent).not.toHaveBeenCalled();
    expect(payload.synced).toBe(false);
  });

  it("returns 500 when the profile saves but the full business reload fails", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique)
      .mockResolvedValueOnce({ id: "biz_1" } as never)
      .mockResolvedValueOnce(null);
    vi.mocked(prisma.business.update).mockResolvedValue({ id: "biz_1" } as never);

    const response = await POST(
      new Request("http://localhost/api/business/profile", {
        method: "POST",
        body: JSON.stringify({ name: "Paw House Updated" }),
      }) as never
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      business: { id: "biz_1" },
      error: "Business profile saved, but failed to reload profile for voice sync.",
    });
  });

  it("returns 502 when retell sync fails after saving", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique)
      .mockResolvedValueOnce({ id: "biz_1" } as never)
      .mockResolvedValueOnce({
        id: "biz_1",
        bookingMode: "SOFT",
        services: [],
        groomers: [],
        breedRecommendations: [],
        retellConfig: { agentId: "agent_1", llmId: "llm_1" },
      } as never);
    vi.mocked(prisma.business.update).mockResolvedValue({ id: "biz_1" } as never);
    vi.mocked(syncRetellAgent).mockRejectedValue(new Error("retell down"));

    const response = await POST(
      new Request("http://localhost/api/business/profile", {
        method: "POST",
        body: JSON.stringify({ name: "Paw House Updated" }),
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(502);
    expect(payload.error).toContain("failed to sync to voice agent");
  });

  it("patches retell config and safe business fields", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique)
      .mockResolvedValueOnce({ id: "biz_1" } as never)
      .mockResolvedValueOnce({
        id: "biz_1",
        services: [],
        groomers: [],
        retellConfig: { agentId: "agent_1", llmId: "llm_1" },
        breedRecommendations: [],
      } as never);
    vi.mocked(prisma.business.update).mockResolvedValue({ id: "biz_1", name: "Updated" } as never);

    const response = await PATCH(
      new Request("http://localhost/api/business/profile", {
        method: "PATCH",
        body: JSON.stringify({
          agentActive: false,
          voiceId: "11labs-Adrian",
          name: "Updated",
          disallowed: "ignored",
        }),
      }) as never
    );
    const payload = await response.json();

    expect(prisma.retellConfig.updateMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1" },
      data: {
        isActive: false,
        voiceId: "11labs-Adrian",
      },
    });
    expect(syncRetellAgent).toHaveBeenCalled();
    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      data: { name: "Updated" },
    });
    expect(payload.business).toEqual({ id: "biz_1", name: "Updated" });
  });

  it("blocks enabling the agent from PATCH without admin approval", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValueOnce({
      id: "biz_1",
      adminApprovedGoLive: false,
    } as never);

    const response = await PATCH(
      new Request("http://localhost/api/business/profile", {
        method: "PATCH",
        body: JSON.stringify({ agentActive: true }),
      }) as never
    );

    expect(response.status).toBe(403);
    await expect(response.json()).resolves.toEqual({
      error: "Admin approval is required to enable live call answering.",
    });
    expect(prisma.retellConfig.updateMany).not.toHaveBeenCalled();
  });

  it("strips isActive from PATCH when not admin-approved but preserves other safe fields", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "owner@example.com", name: "Owner" },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValueOnce({
      adminApprovedGoLive: false,
    } as never);
    vi.mocked(prisma.business.update).mockResolvedValue({
      id: "biz_1",
      onboardingComplete: true,
    } as never);

    const response = await PATCH(
      new Request("http://localhost/api/business/profile", {
        method: "PATCH",
        body: JSON.stringify({ isActive: true, onboardingComplete: true }),
      }) as never
    );
    const payload = await response.json();

    expect(prisma.business.update).toHaveBeenCalledWith({
      where: { userId: "user_1" },
      data: { onboardingComplete: true },
    });
    expect(payload.business).toEqual({ id: "biz_1", onboardingComplete: true });
  });
});
