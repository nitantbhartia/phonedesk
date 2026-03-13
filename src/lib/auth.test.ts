import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/providers/credentials", () => ({
  default: (config: unknown) => ({ id: "credentials", ...(config as object) }),
}));

vi.mock("next-auth/providers/google", () => ({
  default: (config: unknown) => ({ id: "google", ...(config as object) }),
}));

vi.mock("./prisma", () => ({
  prisma: {
    user: {
      findUnique: vi.fn(),
      upsert: vi.fn(),
    },
    account: {
      upsert: vi.fn(),
    },
  },
}));

vi.mock("./password", () => ({
  verifyPassword: vi.fn(),
}));

vi.mock("./rate-limit", () => ({
  rateLimit: vi.fn(),
  resetRateLimits: vi.fn(),
}));

import { authOptions, checkCredentialRateLimit } from "./auth";
import { prisma } from "./prisma";
import { verifyPassword } from "./password";
import { rateLimit, resetRateLimits } from "./rate-limit";

describe("auth helpers", () => {
  beforeEach(() => {
    vi.mocked(prisma.user.findUnique).mockReset();
    vi.mocked(prisma.user.upsert).mockReset();
    vi.mocked(prisma.account.upsert).mockReset();
    vi.mocked(verifyPassword).mockReset();
    vi.mocked(rateLimit).mockReset();
    vi.mocked(resetRateLimits).mockReset();
    vi.mocked(rateLimit).mockReturnValue({ allowed: true } as never);
  });

  it("blocks the sixth credentials attempt from the same IP within the window", () => {
    const request = new Request("http://localhost/api/auth/callback/credentials", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });

    for (let i = 0; i < 5; i++) {
      vi.mocked(rateLimit).mockReturnValueOnce({ allowed: true } as never);
      expect(
        checkCredentialRateLimit("test@example.com", request).allowed
      ).toBe(true);
    }

    vi.mocked(rateLimit).mockReturnValueOnce({ allowed: false } as never);
    expect(
      checkCredentialRateLimit("test@example.com", request).allowed
    ).toBe(false);
  });

  it("authorizes valid credentials and rejects rate-limited or bad credentials", async () => {
    const credentialsProvider = authOptions.providers[0] as {
      authorize: (credentials: Record<string, string>, request: Request) => Promise<unknown>;
    };
    const request = new Request("http://localhost/auth", {
      headers: { "x-real-ip": "203.0.113.10" },
    });

    vi.mocked(prisma.user.findUnique).mockResolvedValue({
      id: "user_1",
      email: "test@example.com",
      name: "Jamie",
      image: null,
      passwordHash: "hash",
    } as never);
    vi.mocked(verifyPassword).mockReturnValue(true);

    await expect(
      credentialsProvider.authorize(
        { email: "Test@Example.com", password: "secret" },
        request
      )
    ).resolves.toEqual({
      id: "user_1",
      email: "test@example.com",
      name: "Jamie",
      image: null,
    });

    vi.mocked(rateLimit).mockReturnValueOnce({ allowed: false } as never);
    await expect(
      credentialsProvider.authorize(
        { email: "test@example.com", password: "secret" },
        request
      )
    ).resolves.toBeNull();

    vi.mocked(rateLimit).mockReturnValueOnce({ allowed: true } as never);
    vi.mocked(verifyPassword).mockReturnValue(false);
    await expect(
      credentialsProvider.authorize(
        { email: "test@example.com", password: "wrong" },
        request
      )
    ).resolves.toBeNull();
  });

  it("persists app users and OAuth tokens in the jwt callback", async () => {
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "db_user_1" } as never);

    const token = await authOptions.callbacks!.jwt!({
      token: {},
      user: {
        id: "oauth_user",
        email: "jamie@example.com",
        name: "Jamie",
        image: null,
      },
      account: {
        provider: "google",
        providerAccountId: "google-1",
        type: "oauth",
        access_token: "access",
        refresh_token: "refresh",
        expires_at: 123,
      },
      profile: undefined,
      trigger: "signIn",
      isNewUser: false,
      session: undefined,
    } as never);

    expect(prisma.account.upsert).toHaveBeenCalled();
    expect(token.id).toBe("db_user_1");
    expect(token.accessToken).toBe("access");
    expect(token.refreshToken).toBe("refresh");
  });

  it("falls back safely when jwt persistence fails", async () => {
    vi.mocked(prisma.user.upsert).mockRejectedValue(new Error("db down"));

    const token = await authOptions.callbacks!.jwt!({
      token: {},
      user: {
        id: "oauth_user",
        email: "jamie@example.com",
        name: "Jamie",
        image: null,
      },
      account: {
        provider: "google",
        providerAccountId: "google-1",
        type: "oauth",
        access_token: "access",
      },
      profile: undefined,
      trigger: "signIn",
      isNewUser: false,
      session: undefined,
    } as never);

    expect(token.id).toBe("oauth_user");
  });

  it("hydrates the session user id and keeps redirects same-origin", async () => {
    vi.mocked(prisma.user.upsert).mockResolvedValue({ id: "db_user_2" } as never);

    const session = await authOptions.callbacks!.session!({
      session: {
        user: {
          email: "jamie@example.com",
          name: "Jamie",
          image: null,
        },
        expires: "2099-01-01T00:00:00.000Z",
      },
      token: { id: "token_user_1" },
      newSession: undefined,
      trigger: "update",
    } as never);

    expect((session.user as { id: string }).id).toBe("db_user_2");
    await expect(
      authOptions.callbacks!.redirect!({
        url: "/settings",
        baseUrl: "https://ringpaw.ai",
      } as never)
    ).resolves.toBe("https://ringpaw.ai/settings");
    await expect(
      authOptions.callbacks!.redirect!({
        url: "https://evil.example/phish",
        baseUrl: "https://ringpaw.ai",
      } as never)
    ).resolves.toBe("https://ringpaw.ai");
  });
});
