import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mockGenerateAuthUrl = vi.fn();
const mockGetToken = vi.fn();
const mockSetCredentials = vi.fn();
const mockCalendarList = vi.fn();

vi.mock("next-auth", () => ({
  getServerSession: vi.fn(),
}));

vi.mock("googleapis", () => ({
  google: {
    auth: {
      OAuth2: vi.fn(() => ({
        generateAuthUrl: mockGenerateAuthUrl,
        getToken: mockGetToken,
        setCredentials: mockSetCredentials,
      })),
    },
    calendar: vi.fn(() => ({
      calendarList: {
        list: mockCalendarList,
      },
    })),
  },
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
      findFirst: vi.fn(),
      update: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
  },
}));

import { GET } from "./route";
import { getServerSession } from "next-auth";
import { prisma } from "@/lib/prisma";

describe("GET /api/calendar/connect", () => {
  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "test-secret";
    process.env.NEXTAUTH_URL = "http://localhost:3000";
    process.env.SQUARE_APP_ID = "square-app-id";
    process.env.SQUARE_APP_SECRET = "square-secret";
    process.env.ACUITY_CLIENT_ID = "acuity-id";
    process.env.ACUITY_CLIENT_SECRET = "acuity-secret";
    mockGenerateAuthUrl.mockReset();
    mockGetToken.mockReset();
    mockSetCredentials.mockReset();
    mockCalendarList.mockReset();
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.calendarConnection.findFirst).mockReset();
    vi.mocked(prisma.calendarConnection.update).mockReset();
    vi.mocked(prisma.calendarConnection.count).mockReset();
    vi.mocked(prisma.calendarConnection.create).mockReset();
    vi.mocked(prisma.calendarConnection.updateMany).mockReset();
    global.fetch = vi.fn();
  });

  it("generates a signed OAuth state when starting Google connect", async () => {
    mockGenerateAuthUrl.mockImplementation(({ state }) => {
      return `https://accounts.example/auth?state=${encodeURIComponent(state)}`;
    });

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/calendar/connect?provider=google&redirect=/settings/calendar"
      ) as never
    );

    expect(response.status).toBe(307);
    const location = response.headers.get("location");
    expect(location).toContain("https://accounts.example/auth");
    const state = new URL(location!).searchParams.get("state");
    expect(state).toBeTruthy();
    expect(state).not.toContain("{");
    expect(state).toContain(".");
  });

  it("rejects callback requests with an invalid OAuth state", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/calendar/connect?code=abc123&state=forged-state"
      ) as never
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/settings/calendar?error=invalid_oauth_state"
    );
    expect(mockGetToken).not.toHaveBeenCalled();
  });

  it("redirects back to settings when the callback provider is unsupported in state", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);

    const payload = Buffer.from(
      JSON.stringify({
        redirect: "/settings/calendar",
        provider: "unsupported",
        nonce: "nonce-unsupported",
        issuedAt: Date.now(),
      })
    ).toString("base64url");
    const signature = require("node:crypto")
      .createHmac("sha256", "test-secret")
      .update(payload)
      .digest("base64url");

    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/calendar/connect?code=abc123&state=${payload}.${signature}`
      ) as never
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/settings/calendar?error=invalid_oauth_state"
    );
    vi.useRealTimers();
  });

  it("starts Square OAuth with a signed state", async () => {
    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/calendar/connect?provider=square&redirect=/settings/calendar"
      ) as never
    );

    expect(response.status).toBe(307);
    const location = new URL(response.headers.get("location")!);
    expect(location.origin).toContain("square");
    expect(location.searchParams.get("state")).toContain(".");
    expect(location.searchParams.get("client_id")).toBe("square-app-id");
  });

  it("connects Square and creates the first active connection as primary", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));
    const state = Buffer.from(
      JSON.stringify({
        redirect: "/settings/calendar",
        provider: "square",
        nonce: "nonce-1",
        issuedAt: Date.now(),
      })
    ).toString("base64url");
    const signature = require("node:crypto")
      .createHmac("sha256", "test-secret")
      .update(state)
      .digest("base64url");

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);
    vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.calendarConnection.count).mockResolvedValue(0);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "square-token",
            refresh_token: "refresh-token",
            expires_at: "2026-04-12T12:00:00.000Z",
            merchant_id: "merchant_1",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            locations: [{ id: "loc_1", name: "Main Shop" }],
          }),
          { status: 200 }
        )
      );

    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/calendar/connect?code=abc&state=${state}.${signature}`
      ) as never
    );

    expect(response.status).toBe(307);
    expect(prisma.calendarConnection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: "biz_1",
        provider: "SQUARE",
        isPrimary: true,
        accessToken: "square-token",
        calendarId: "loc_1",
      }),
    });
    vi.useRealTimers();
  });

  it("updates an existing Square connection when one already exists", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));
    const state = Buffer.from(
      JSON.stringify({
        redirect: "/settings/calendar",
        provider: "square",
        nonce: "nonce-1",
        issuedAt: Date.now(),
      })
    ).toString("base64url");
    const signature = require("node:crypto")
      .createHmac("sha256", "test-secret")
      .update(state)
      .digest("base64url");

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);
    vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue({
      id: "conn_square",
    } as never);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "square-token",
            refresh_token: "refresh-token",
            expires_at: "2026-04-12T12:00:00.000Z",
            merchant_id: "merchant_1",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            locations: [{ id: "loc_1", name: "Main Shop" }],
          }),
          { status: 200 }
        )
      );

    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/calendar/connect?code=abc&state=${state}.${signature}`
      ) as never
    );

    expect(response.status).toBe(307);
    expect(prisma.calendarConnection.update).toHaveBeenCalledWith({
      where: { id: "conn_square" },
      data: expect.objectContaining({
        accessToken: "square-token",
        refreshToken: "refresh-token",
        tokenExpiry: new Date("2026-04-12T12:00:00.000Z"),
        calendarId: "loc_1",
        isActive: true,
        metadata: {
          locationId: "loc_1",
          merchantId: "merchant_1",
          locationName: "Main Shop",
        },
      }),
    });
    vi.useRealTimers();
  });

  it("redirects with an error when Square token exchange fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));
    const state = Buffer.from(
      JSON.stringify({
        redirect: "/settings/calendar",
        provider: "square",
        nonce: "nonce-1",
        issuedAt: Date.now(),
      })
    ).toString("base64url");
    const signature = require("node:crypto")
      .createHmac("sha256", "test-secret")
      .update(state)
      .digest("base64url");

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "bad token" }), { status: 500 })
    );

    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/calendar/connect?code=abc&state=${state}.${signature}`
      ) as never
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/settings/calendar?error=calendar_connect_failed"
    );
    vi.useRealTimers();
  });

  it("redirects to the homepage when the OAuth callback has no session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const state = mockGenerateAuthUrl.mock.calls.length;
    expect(state).toBeGreaterThanOrEqual(0);

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/calendar/connect?code=abc&state=forged.invalid"
      ) as never
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe("http://localhost:3000/");
  });

  it("connects Google and updates an existing connection", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);
    vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue({
      id: "conn_1",
      refreshToken: "existing-refresh",
    } as never);
    mockGetToken.mockResolvedValue({
      tokens: {
        access_token: "google-access",
        expiry_date: Date.parse("2026-04-01T00:00:00.000Z"),
      },
    });
    mockCalendarList.mockResolvedValue({
      data: {
        items: [{ primary: true, id: "primary-cal" }],
      },
    });

    const payload = Buffer.from(
      JSON.stringify({
        redirect: "/settings/calendar",
        provider: "google",
        nonce: "nonce-google",
        issuedAt: Date.now(),
      })
    ).toString("base64url");
    const signature = require("node:crypto")
      .createHmac("sha256", "test-secret")
      .update(payload)
      .digest("base64url");

    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/calendar/connect?code=abc&state=${payload}.${signature}`
      ) as never
    );

    expect(response.status).toBe(307);
    expect(prisma.calendarConnection.update).toHaveBeenCalledWith({
      where: { id: "conn_1" },
      data: {
        accessToken: "google-access",
        refreshToken: "existing-refresh",
        tokenExpiry: new Date("2026-04-01T00:00:00.000Z"),
        calendarId: "primary-cal",
        isActive: true,
      },
    });
    vi.useRealTimers();
  });

  it("creates a new Google connection when none exists", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);
    vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.calendarConnection.count).mockResolvedValue(1);
    mockGetToken.mockResolvedValue({
      tokens: {
        access_token: "google-access",
        refresh_token: "google-refresh",
      },
    });
    mockCalendarList.mockResolvedValue({
      data: { items: [] },
    });

    const payload = Buffer.from(
      JSON.stringify({
        redirect: "/settings/calendar",
        provider: "google",
        nonce: "nonce-google",
        issuedAt: Date.now(),
      })
    ).toString("base64url");
    const signature = require("node:crypto")
      .createHmac("sha256", "test-secret")
      .update(payload)
      .digest("base64url");

    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/calendar/connect?code=abc&state=${payload}.${signature}`
      ) as never
    );

    expect(response.status).toBe(307);
    expect(prisma.calendarConnection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: "biz_1",
        provider: "GOOGLE",
        isPrimary: false,
        accessToken: "google-access",
        refreshToken: "google-refresh",
        calendarId: "primary",
      }),
    });
    vi.useRealTimers();
  });

  it("redirects with an error when Google token exchange throws", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);
    mockGetToken.mockRejectedValue(new Error("google down"));

    const payload = Buffer.from(
      JSON.stringify({
        redirect: "/settings/calendar",
        provider: "google",
        nonce: "nonce-google",
        issuedAt: Date.now(),
      })
    ).toString("base64url");
    const signature = require("node:crypto")
      .createHmac("sha256", "test-secret")
      .update(payload)
      .digest("base64url");

    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/calendar/connect?code=abc&state=${payload}.${signature}`
      ) as never
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/settings/calendar?error=calendar_connect_failed"
    );
    vi.useRealTimers();
  });

  it("connects Acuity and creates a primary connection", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));
    const state = Buffer.from(
      JSON.stringify({
        redirect: "/settings/calendar",
        provider: "acuity",
        nonce: "nonce-acuity",
        issuedAt: Date.now(),
      })
    ).toString("base64url");
    const signature = require("node:crypto")
      .createHmac("sha256", "test-secret")
      .update(state)
      .digest("base64url");

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);
    vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.calendarConnection.count).mockResolvedValue(0);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "acuity-token",
            refresh_token: "acuity-refresh",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            id: 42,
            email: "owner@example.com",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify([{ id: 123 }]),
          { status: 200 }
        )
      );

    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/calendar/connect?code=abc&state=${state}.${signature}`
      ) as never
    );

    expect(response.status).toBe(307);
    expect(prisma.calendarConnection.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        businessId: "biz_1",
        provider: "ACUITY",
        isPrimary: true,
        accessToken: "acuity-token",
        refreshToken: "acuity-refresh",
        calendarId: "42",
        metadata: {
          userId: 42,
          email: "owner@example.com",
          appointmentTypeId: 123,
        },
      }),
    });
    vi.useRealTimers();
  });

  it("updates an existing Acuity connection and tolerates optional API lookups failing", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));
    const state = Buffer.from(
      JSON.stringify({
        redirect: "/settings/calendar",
        provider: "acuity",
        nonce: "nonce-acuity",
        issuedAt: Date.now(),
      })
    ).toString("base64url");
    const signature = require("node:crypto")
      .createHmac("sha256", "test-secret")
      .update(state)
      .digest("base64url");

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);
    vi.mocked(prisma.calendarConnection.findFirst).mockResolvedValue({
      id: "conn_acuity",
    } as never);
    vi.mocked(fetch)
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            access_token: "acuity-token",
          }),
          { status: 200 }
        )
      )
      .mockResolvedValueOnce(new Response("{}", { status: 500 }))
      .mockResolvedValueOnce(new Response("[]", { status: 500 }));

    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/calendar/connect?code=abc&state=${state}.${signature}`
      ) as never
    );

    expect(response.status).toBe(307);
    expect(prisma.calendarConnection.update).toHaveBeenCalledWith({
      where: { id: "conn_acuity" },
      data: expect.objectContaining({
        accessToken: "acuity-token",
        refreshToken: null,
        calendarId: "",
        metadata: {
          userId: undefined,
          email: undefined,
          appointmentTypeId: null,
        },
        isActive: true,
      }),
    });
    vi.useRealTimers();
  });

  it("redirects with an error when Acuity token exchange fails", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));
    const state = Buffer.from(
      JSON.stringify({
        redirect: "/settings/calendar",
        provider: "acuity",
        nonce: "nonce-acuity",
        issuedAt: Date.now(),
      })
    ).toString("base64url");
    const signature = require("node:crypto")
      .createHmac("sha256", "test-secret")
      .update(state)
      .digest("base64url");

    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);
    vi.mocked(fetch).mockResolvedValue(
      new Response(JSON.stringify({ error: "bad token" }), { status: 500 })
    );

    const response = await GET(
      new NextRequest(
        `http://localhost:3000/api/calendar/connect?code=abc&state=${state}.${signature}`
      ) as never
    );

    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/settings/calendar?error=calendar_connect_failed"
    );
    vi.useRealTimers();
  });

  it("redirects to onboarding when the session has no business yet", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue(null);

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/calendar/connect?code=abc&state=forged.invalid"
      ) as never
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toBe(
      "http://localhost:3000/onboarding"
    );
  });

  it("falls back to the default safe redirect when a bootstrap redirect is absolute", async () => {
    mockGenerateAuthUrl.mockImplementation(({ state }) => {
      return `https://accounts.example/auth?state=${encodeURIComponent(state)}`;
    });

    const response = await GET(
      new NextRequest(
        "http://localhost:3000/api/calendar/connect?provider=google&redirect=https://evil.example/phish"
      ) as never
    );

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("https://accounts.example/auth");
    const state = new URL(response.headers.get("location")!).searchParams.get("state");
    const [encoded] = state!.split(".");
    const parsed = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8"));
    expect(parsed.redirect).toBe("https://evil.example/phish");
  });

  it("returns 400 for unsupported provider bootstraps", async () => {
    const response = await GET(
      new NextRequest("http://localhost:3000/api/calendar/connect?provider=unknown") as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({
      error: "Unsupported calendar provider",
    });
  });

  it("disconnects a calendar provider for the current business", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      id: "biz_1",
    } as never);

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new NextRequest(
        "http://localhost:3000/api/calendar/connect?provider=google",
        { method: "DELETE" }
      ) as never
    );

    expect(response.status).toBe(200);
    expect(prisma.calendarConnection.updateMany).toHaveBeenCalledWith({
      where: {
        businessId: "biz_1",
        provider: "GOOGLE",
      },
      data: { isActive: false, accessToken: null, refreshToken: null },
    });
    await expect(response.json()).resolves.toEqual({ success: true });
  });

  it("rejects disconnect requests without a session", async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new NextRequest(
        "http://localhost:3000/api/calendar/connect?provider=google",
        { method: "DELETE" }
      ) as never
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("rejects disconnect requests without a provider", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/calendar/connect", {
        method: "DELETE",
      }) as never
    );

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Missing provider" });
  });

  it("returns 404 when disconnecting without a business", async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: "user_1" },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue(null);

    const { DELETE } = await import("./route");
    const response = await DELETE(
      new NextRequest("http://localhost:3000/api/calendar/connect?provider=google", {
        method: "DELETE",
      }) as never
    );

    expect(response.status).toBe(404);
    await expect(response.json()).resolves.toEqual({ error: "No business" });
  });
});
