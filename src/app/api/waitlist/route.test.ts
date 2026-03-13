import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    waitlistEntry: {
      findMany: vi.fn(),
      create: vi.fn(),
      deleteMany: vi.fn(),
    },
  },
}));

vi.mock("@/lib/route-helpers", () => ({
  requireCurrentBusiness: vi.fn(),
  parseJsonBody: vi.fn(),
}));

import { prisma } from "@/lib/prisma";
import { parseJsonBody, requireCurrentBusiness } from "@/lib/route-helpers";
import { DELETE, GET, POST } from "./route";

describe("GET /api/waitlist", () => {
  beforeEach(() => {
    vi.mocked(prisma.waitlistEntry.findMany).mockReset();
    vi.mocked(prisma.waitlistEntry.create).mockReset();
    vi.mocked(prisma.waitlistEntry.deleteMany).mockReset();
    vi.mocked(requireCurrentBusiness).mockReset();
    vi.mocked(parseJsonBody).mockReset();
    vi.mocked(requireCurrentBusiness).mockResolvedValue({
      business: { id: "biz_1" },
      userId: "user_1",
    } as never);
  });

  it("returns 400 for an invalid waitlist status", async () => {
    const req = new NextRequest("http://localhost/api/waitlist?status=NOPE");
    const response = await GET(req);
    const payload = await response.json();

    expect(response.status).toBe(400);
    expect(payload.error).toBe("Invalid status");
    expect(prisma.waitlistEntry.findMany).not.toHaveBeenCalled();
  });

  it("creates a waitlist entry with normalized optional fields", async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({
      data: {
        customerName: "Jamie",
        customerPhone: "(619) 555-0100",
        petName: "",
        petBreed: "",
        petSize: null,
        serviceName: "",
        preferredDate: "2026-03-14T09:00:00.000Z",
        preferredTime: "",
        notes: "",
      },
    } as never);
    vi.mocked(prisma.waitlistEntry.create).mockResolvedValue({
      id: "wait_1",
      customerPhone: "+16195550100",
    } as never);

    const response = await POST(
      new NextRequest("http://localhost/api/waitlist", { method: "POST" })
    );
    const payload = await response.json();

    expect(response.status).toBe(201);
    expect(prisma.waitlistEntry.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: "biz_1",
        customerName: "Jamie",
        customerPhone: "+16195550100",
        petName: null,
        petBreed: null,
        petSize: null,
        serviceName: null,
        preferredTime: null,
        notes: null,
      }),
    });
    expect(payload.entry.id).toBe("wait_1");
  });

  it("rejects invalid preferred dates before creating a waitlist entry", async () => {
    vi.mocked(parseJsonBody).mockResolvedValue({
      data: {
        customerName: "Jamie",
        customerPhone: "+16195550100",
        petName: "",
        petBreed: "",
        petSize: null,
        serviceName: "",
        preferredDate: "not-a-date",
        preferredTime: "",
        notes: "",
      },
    } as never);

    const response = await POST(
      new NextRequest("http://localhost/api/waitlist", { method: "POST" })
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "preferredDate must be a valid date",
    });
    expect(prisma.waitlistEntry.create).not.toHaveBeenCalled();
  });

  it("deletes waitlist entries scoped to the current business", async () => {
    const response = await DELETE(
      new NextRequest("http://localhost/api/waitlist?id=wait_1", {
        method: "DELETE",
      })
    );

    expect(response.status).toBe(200);
    expect(prisma.waitlistEntry.deleteMany).toHaveBeenCalledWith({
      where: { id: "wait_1", businessId: "biz_1" },
    });
    await expect(response.json()).resolves.toEqual({ success: true });
  });
});
