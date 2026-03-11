import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({
  authOptions: {},
}));

vi.mock("@/lib/prisma", () => ({
  prisma: {
    business: {
      findUnique: vi.fn(),
    },
    calendarConnection: {
      updateMany: vi.fn(),
      update: vi.fn(),
    },
    user: {
      upsert: vi.fn(),
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import { PATCH } from "./route";

describe("calendar/settings", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.calendarConnection.updateMany).mockReset();
    vi.mocked(prisma.calendarConnection.update).mockReset();
  });

  it("saves the primary destination when the connection belongs to the business", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
      calendarConnections: [{ id: "conn_1" }, { id: "conn_2" }],
    } as never);

    const response = await PATCH(
      new Request("http://localhost/api/calendar/settings", {
        method: "PATCH",
        body: JSON.stringify({ primaryConnectionId: "conn_2" }),
      }) as never
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.calendarConnection.updateMany).toHaveBeenCalledWith({
      where: { businessId: "biz_1" },
      data: { isPrimary: false },
    });
    expect(prisma.calendarConnection.update).toHaveBeenCalledWith({
      where: { id: "conn_2" },
      data: { isPrimary: true },
    });
    expect(payload.message).toBe("Primary booking destination updated");
  });
});
