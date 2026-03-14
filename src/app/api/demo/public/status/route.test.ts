import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    publicDemoAttempt: {
      findUnique: vi.fn(),
    },
    call: {
      findFirst: vi.fn(),
    },
  },
}));

import { GET } from "./route";
import { prisma } from "@/lib/prisma";

describe("GET /api/demo/public/status", () => {
  beforeEach(() => {
    process.env.DEMO_BUSINESS_ID = "demo_biz";
    vi.mocked(prisma.publicDemoAttempt.findUnique).mockReset();
    vi.mocked(prisma.call.findFirst).mockReset();
  });

  it("uses the attempt caller phone to find the matching demo call", async () => {
    vi.mocked(prisma.publicDemoAttempt.findUnique).mockResolvedValue({
      sessionToken: "token_1",
      startedAt: new Date("2026-03-11T22:00:00.000Z"),
      callerPhone: "+16195550100",
    } as never);
    vi.mocked(prisma.call.findFirst).mockResolvedValue({
      status: "IN_PROGRESS",
      summary: null,
      transcriptObject: null,
    } as never);

    const response = await GET(
      {
        nextUrl: new URL("http://localhost/api/demo/public/status?token=token_1"),
      } as never
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(prisma.call.findFirst).toHaveBeenCalledWith({
      where: {
        businessId: "demo_biz",
        createdAt: { gte: new Date("2026-03-11T22:00:00.000Z") },
        OR: [
          { callerPhone: "+16195550100" },
          { callerPhone: "+16195550100" },
        ],
      },
      orderBy: { createdAt: "desc" },
    });
    expect(payload.phase).toBe("in_progress");
    // transcriptObject is null while call is in progress
    expect(payload.transcriptObject).toBeNull();
  });

  it("returns transcriptObject when the call is completed", async () => {
    const fakeTranscript = [
      { role: "agent", content: "Hi, thanks for calling!" },
      { role: "user", content: "I need a groom for my poodle." },
      { role: "tool_call_invocation", name: "check_availability", tool_call_id: "t1" },
      { role: "agent", content: "I have Tuesday at 2pm available." },
    ];

    vi.mocked(prisma.publicDemoAttempt.findUnique).mockResolvedValue({
      sessionToken: "token_2",
      startedAt: new Date("2026-03-11T22:00:00.000Z"),
      callerPhone: "+16195550101",
    } as never);
    vi.mocked(prisma.call.findFirst).mockResolvedValue({
      status: "COMPLETED",
      summary: "Booked a groom for a poodle on Tuesday at 2pm.",
      transcriptObject: fakeTranscript,
    } as never);

    const response = await GET(
      {
        nextUrl: new URL("http://localhost/api/demo/public/status?token=token_2"),
      } as never
    );
    const payload = await response.json();

    expect(response.status).toBe(200);
    expect(payload.phase).toBe("completed");
    expect(payload.summary).toBe("Booked a groom for a poodle on Tuesday at 2pm.");
    expect(payload.transcriptObject).toEqual(fakeTranscript);
  });

  it("returns null transcriptObject for a NO_BOOKING call with no transcript stored", async () => {
    vi.mocked(prisma.publicDemoAttempt.findUnique).mockResolvedValue({
      sessionToken: "token_3",
      startedAt: new Date("2026-03-11T22:00:00.000Z"),
      callerPhone: "+16195550102",
    } as never);
    vi.mocked(prisma.call.findFirst).mockResolvedValue({
      status: "NO_BOOKING",
      summary: null,
      transcriptObject: null,
    } as never);

    const response = await GET(
      {
        nextUrl: new URL("http://localhost/api/demo/public/status?token=token_3"),
      } as never
    );
    const payload = await response.json();

    expect(payload.phase).toBe("completed");
    expect(payload.transcriptObject).toBeNull();
  });
});
