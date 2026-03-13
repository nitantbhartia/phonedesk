import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

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
    },
  },
}));

import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";
import {
  errorFromResponse,
  parseJsonBody,
  requireCurrentBusiness,
  requireCurrentUserId,
} from "./route-helpers";

describe("route helpers", () => {
  beforeEach(() => {
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.user.upsert).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
  });

  it("parses valid json and returns validation errors for bad payloads", async () => {
    const schema = z.object({ name: z.string().min(1) });

    await expect(
      parseJsonBody(
        new Request("http://localhost", {
          method: "POST",
          body: JSON.stringify({ name: "Jamie" }),
        }),
        schema
      )
    ).resolves.toEqual({ data: { name: "Jamie" } });

    const invalid = await parseJsonBody(
      new Request("http://localhost", {
        method: "POST",
        body: JSON.stringify({ name: "" }),
      }),
      schema
    );
    expect("response" in invalid).toBe(true);
    if ("response" in invalid) {
      expect(invalid.response.status).toBe(400);
    }
  });

  it("requires a logged-in user and can backfill one from email", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null as never);
    const unauthorized = await requireCurrentUserId();
    expect("response" in unauthorized).toBe(true);

    vi.mocked(getServerSession).mockResolvedValue({
      user: { email: "jamie@example.com", name: "Jamie", image: null },
    } as never);
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "user_1" } as never);

    await expect(requireCurrentUserId()).resolves.toEqual({ userId: "user_1" });
  });

  it("loads the current business and wraps plain objects as error responses", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);

    await expect(requireCurrentBusiness()).resolves.toEqual({
      userId: "user_1",
      business: { id: "biz_1" },
    });

    const response = errorFromResponse({ error: "nope" });
    expect(response.status).toBe(400);
  });
});
