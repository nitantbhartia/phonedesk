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
    mockGenerateAuthUrl.mockReset();
    mockGetToken.mockReset();
    mockSetCredentials.mockReset();
    mockCalendarList.mockReset();
    vi.mocked(getServerSession).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
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
});
