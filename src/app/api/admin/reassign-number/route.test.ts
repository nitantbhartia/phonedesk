import { beforeEach, describe, expect, it, vi } from "vitest";

const { mockDeleteRetellPhoneNumber } = vi.hoisted(() => ({
  mockDeleteRetellPhoneNumber: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: {
      findUnique: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    $transaction: vi.fn(),
  },
}));

vi.mock("@/lib/retell", async () => {
  const actual = await vi.importActual<typeof import("@/lib/retell")>("@/lib/retell");
  return {
    ...actual,
    updateRetellPhoneNumber: vi.fn(),
    deleteRetellPhoneNumber: mockDeleteRetellPhoneNumber,
  };
});

vi.mock("@/lib/retell-auth", () => ({
  buildRetellWebhookUrl: vi.fn(() => "https://app.test/api/sms/webhook"),
}));

import { prisma } from "@/lib/prisma";
import { updateRetellPhoneNumber } from "@/lib/retell";
import { DELETE, POST } from "./route";

describe("/api/admin/reassign-number", () => {
  beforeEach(() => {
    process.env.ADMIN_SECRET = "top-secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.test";
    vi.mocked(prisma.phoneNumber.findUnique).mockReset();
    vi.mocked(prisma.phoneNumber.update).mockReset();
    vi.mocked(prisma.phoneNumber.delete).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.business.update).mockReset();
    vi.mocked(prisma.$transaction).mockReset();
    vi.mocked(updateRetellPhoneNumber).mockReset();
    mockDeleteRetellPhoneNumber.mockReset();
  });

  it("rejects requests with the wrong admin bearer token", async () => {
    const response = await POST(
      new Request("http://localhost/api/admin/reassign-number", {
        method: "POST",
        headers: { authorization: "Bearer nope" },
        body: JSON.stringify({ phoneNumber: "+16195550100" }),
      })
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("returns 500 when the admin secret is missing", async () => {
    delete process.env.ADMIN_SECRET;

    const response = await POST(
      new Request("http://localhost/api/admin/reassign-number", {
        method: "POST",
        body: JSON.stringify({ phoneNumber: "+16195550100" }),
      })
    );

    expect(response.status).toBe(500);
    await expect(response.json()).resolves.toEqual({
      error: "ADMIN_SECRET is not configured",
    });
  });

  it("reassigns a number to another business with Retell and a transaction", async () => {
    vi.mocked(prisma.phoneNumber.findUnique).mockResolvedValue({
      number: "+16195550100",
      businessId: "biz_old",
      business: { name: "Old Shop" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_new",
      name: "New Shop",
      phoneNumber: null,
      retellConfig: { agentId: "agent_1" },
      services: [],
      breedRecommendations: [],
    } as never);
    vi.mocked(prisma.phoneNumber.update).mockReturnValue("phone-update" as never);
    vi.mocked(prisma.business.update).mockReturnValue("business-update" as never);

    const response = await POST(
      new Request("http://localhost/api/admin/reassign-number", {
        method: "POST",
        headers: { authorization: "Bearer top-secret" },
        body: JSON.stringify({
          phoneNumber: "+16195550100",
          toBusinessId: "biz_new",
        }),
      })
    );

    expect(response.status).toBe(200);
    expect(updateRetellPhoneNumber).toHaveBeenCalledWith("+16195550100", {
      inboundAgentId: "agent_1",
      nickname: "New Shop - RingPaw",
      smsWebhookUrl: "https://app.test/api/sms/webhook",
    });
    expect(prisma.$transaction).toHaveBeenCalledWith([
      "phone-update",
      "business-update",
    ]);
    await expect(response.json()).resolves.toEqual({
      ok: true,
      phoneNumber: "+16195550100",
      from: "biz_old",
      to: "biz_new",
      message: "+16195550100 reassigned from Old Shop → New Shop",
    });
  });

  it("returns 409 when the target business already has a number", async () => {
    vi.mocked(prisma.phoneNumber.findUnique).mockResolvedValue({
      number: "+16195550100",
      businessId: "biz_old",
      business: { name: "Old Shop" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_new",
      phoneNumber: { number: "+16195559999" },
      retellConfig: { agentId: "agent_1" },
    } as never);

    const response = await POST(
      new Request("http://localhost/api/admin/reassign-number", {
        method: "POST",
        headers: { authorization: "Bearer top-secret" },
        body: JSON.stringify({
          phoneNumber: "+16195550100",
          toBusinessId: "biz_new",
        }),
      })
    );

    expect(response.status).toBe(409);
    await expect(response.json()).resolves.toEqual({
      error: "Target business already has number +16195559999. Release it first.",
    });
  });

  it("returns 422 when the target business has no Retell agent", async () => {
    vi.mocked(prisma.phoneNumber.findUnique).mockResolvedValue({
      number: "+16195550100",
      businessId: "biz_old",
      business: { name: "Old Shop" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_new",
      name: "New Shop",
      phoneNumber: null,
      retellConfig: null,
    } as never);

    const response = await POST(
      new Request("http://localhost/api/admin/reassign-number", {
        method: "POST",
        headers: { authorization: "Bearer top-secret" },
        body: JSON.stringify({
          phoneNumber: "+16195550100",
          toBusinessId: "biz_new",
        }),
      })
    );

    expect(response.status).toBe(422);
    await expect(response.json()).resolves.toEqual({
      error:
        "Target business has no Retell agent configured. Run /api/retell/configure first.",
    });
  });

  it("detaches a number from the current business when no target is provided", async () => {
    vi.mocked(prisma.phoneNumber.findUnique).mockResolvedValue({
      number: "+16195550100",
      businessId: "biz_old",
      business: { name: "Old Shop" },
    } as never);

    const response = await POST(
      new Request("http://localhost/api/admin/reassign-number", {
        method: "POST",
        headers: { authorization: "Bearer top-secret" },
        body: JSON.stringify({ phoneNumber: "+16195550100" }),
      })
    );

    expect(response.status).toBe(200);
    expect(prisma.phoneNumber.delete).toHaveBeenCalledWith({
      where: { number: "+16195550100" },
    });
  });

  it("returns a warning response when Retell deletion fails during full release", async () => {
    vi.mocked(prisma.phoneNumber.findUnique).mockResolvedValue({
      number: "+16195550100",
    } as never);
    mockDeleteRetellPhoneNumber.mockRejectedValue(new Error("Retell down"));

    const response = await DELETE(
      new Request("http://localhost/api/admin/reassign-number", {
        method: "DELETE",
        headers: { authorization: "Bearer top-secret" },
        body: JSON.stringify({ phoneNumber: "+16195550100" }),
      })
    );

    expect(response.status).toBe(207);
    await expect(response.json()).resolves.toEqual({
      ok: false,
      warning:
        "Removed from DB but Retell deletion failed — delete manually in Retell dashboard",
      error: "Retell down",
    });
  });

  it("fully releases a number when Retell deletion succeeds", async () => {
    vi.mocked(prisma.phoneNumber.findUnique).mockResolvedValue({
      number: "+16195550100",
    } as never);

    const response = await DELETE(
      new Request("http://localhost/api/admin/reassign-number", {
        method: "DELETE",
        headers: { authorization: "Bearer top-secret" },
        body: JSON.stringify({ phoneNumber: "+16195550100" }),
      })
    );

    expect(response.status).toBe(200);
    expect(prisma.phoneNumber.delete).toHaveBeenCalledWith({
      where: { number: "+16195550100" },
    });
    expect(mockDeleteRetellPhoneNumber).toHaveBeenCalledWith("+16195550100");
  });
});
