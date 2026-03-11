import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/password", () => ({
  hashPassword: vi.fn(() => "hashed-password"),
  isPasswordStrongEnough: vi.fn(() => true),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import { hashPassword, isPasswordStrongEnough } from "@/lib/password";

function makeRequest(body: unknown) {
  return new Request("http://localhost/api/auth/register", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("POST /api/auth/register", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.user.create).mockReset();
    vi.mocked(hashPassword).mockClear();
    vi.mocked(isPasswordStrongEnough).mockReturnValue(true);
  });

  it("creates a new password user", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.user.create).mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
      name: "Test User",
    } as never);

    const response = await POST(
      makeRequest({
        name: "Test User",
        email: "test@example.com",
        password: "super-secure-password",
      })
    );

    expect(response.status).toBe(200);
    expect(prisma.user.create).toHaveBeenCalledWith({
      data: {
        name: "Test User",
        email: "test@example.com",
        passwordHash: "hashed-password",
      },
    });
  });

  it("rejects registration for an existing OAuth-only account", async () => {
    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
      name: "Existing",
      passwordHash: null,
    } as never);

    const response = await POST(
      makeRequest({
        name: "Attacker",
        email: "test@example.com",
        password: "super-secure-password",
      })
    );
    const payload = await response.json();

    expect(response.status).toBe(409);
    expect(payload.error).toContain("already exists");
    expect(prisma.user.create).not.toHaveBeenCalled();
  });
});
