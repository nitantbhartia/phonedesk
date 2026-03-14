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

// Helper: read all SSE events from a streaming response until it closes
async function readAllEvents(response: Response): Promise<object[]> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  const events: object[] = [];

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const chunks = buffer.split("\n\n");
    buffer = chunks.pop() ?? "";
    for (const chunk of chunks) {
      const match = chunk.match(/^data: (.+)$/m);
      if (match) events.push(JSON.parse(match[1]));
    }
  }
  return events;
}

describe("GET /api/demo/public/stream", () => {
  beforeEach(() => {
    process.env.DEMO_BUSINESS_ID = "demo_biz";
    vi.mocked(prisma.publicDemoAttempt.findUnique).mockReset();
    vi.mocked(prisma.call.findFirst).mockReset();
  });

  it("returns 400 when token is missing", async () => {
    const response = await GET({
      nextUrl: new URL("http://localhost/api/demo/public/stream"),
    } as never);

    expect(response.status).toBe(400);
  });

  it("streams error event when session is not found", async () => {
    vi.mocked(prisma.publicDemoAttempt.findUnique).mockResolvedValue(null);

    const response = await GET({
      nextUrl: new URL("http://localhost/api/demo/public/stream?token=bad_token"),
    } as never);

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    const events = await readAllEvents(response);
    expect(events).toContainEqual(
      expect.objectContaining({ phase: "error" })
    );
  });

  it("streams 'waiting' when caller phone is not yet known", async () => {
    // callerPhone is null until call_started fires
    vi.mocked(prisma.publicDemoAttempt.findUnique).mockResolvedValue({
      sessionToken: "tok",
      startedAt: new Date("2026-03-14T10:00:00Z"),
      callerPhone: null,
    } as never);

    const response = await GET({
      nextUrl: new URL("http://localhost/api/demo/public/stream?token=tok"),
    } as never);

    // Read just one event then cancel (don't wait for the full timeout loop)
    const reader = response.body!.getReader();
    const { value } = await reader.read();
    reader.cancel();

    const text = new TextDecoder().decode(value);
    expect(text).toContain('"phase":"waiting"');
  });

  it("streams 'completed' with summary and transcriptObject when call is terminal", async () => {
    const fakeTranscript = [
      { role: "agent", content: "Hi, thanks for calling!" },
      { role: "user", content: "Hi, I need a groom for my dog." },
      { role: "tool_call_invocation", name: "check_availability", tool_call_id: "t1" },
      { role: "agent", content: "I have Thursday at 10am." },
    ];

    vi.mocked(prisma.publicDemoAttempt.findUnique).mockResolvedValue({
      sessionToken: "tok",
      startedAt: new Date("2026-03-14T10:00:00Z"),
      callerPhone: "+16195550100",
    } as never);

    vi.mocked(prisma.call.findFirst).mockResolvedValue({
      status: "COMPLETED",
      summary: "Booked a full groom for a golden retriever on Thursday at 10am.",
      transcriptObject: fakeTranscript,
    } as never);

    const response = await GET({
      nextUrl: new URL("http://localhost/api/demo/public/stream?token=tok"),
    } as never);

    const events = await readAllEvents(response);
    const completedEvent = events.find(
      (e) => (e as { phase: string }).phase === "completed"
    ) as { phase: string; summary: string; transcriptObject: unknown[] } | undefined;

    expect(completedEvent).toBeDefined();
    expect(completedEvent!.summary).toBe(
      "Booked a full groom for a golden retriever on Thursday at 10am."
    );
    expect(completedEvent!.transcriptObject).toEqual(fakeTranscript);
  });

  it("streams 'in_progress' for an active call", async () => {
    vi.mocked(prisma.publicDemoAttempt.findUnique).mockResolvedValue({
      sessionToken: "tok",
      startedAt: new Date("2026-03-14T10:00:00Z"),
      callerPhone: "+16195550100",
    } as never);

    vi.mocked(prisma.call.findFirst).mockResolvedValueOnce({
      status: "IN_PROGRESS",
      summary: null,
      transcriptObject: null,
    } as never).mockResolvedValueOnce({
      status: "COMPLETED",
      summary: "Done.",
      transcriptObject: null,
    } as never);

    const response = await GET({
      nextUrl: new URL("http://localhost/api/demo/public/stream?token=tok"),
    } as never);

    const reader = response.body!.getReader();
    const { value } = await reader.read();
    reader.cancel();

    const text = new TextDecoder().decode(value);
    expect(text).toContain('"phase":"in_progress"');
  });

  it("sets SSE headers correctly", async () => {
    vi.mocked(prisma.publicDemoAttempt.findUnique).mockResolvedValue({
      sessionToken: "tok",
      startedAt: new Date("2026-03-14T10:00:00Z"),
      callerPhone: "+16195550100",
    } as never);
    vi.mocked(prisma.call.findFirst).mockResolvedValue({
      status: "COMPLETED",
      summary: null,
      transcriptObject: null,
    } as never);

    const response = await GET({
      nextUrl: new URL("http://localhost/api/demo/public/stream?token=tok"),
    } as never);

    expect(response.headers.get("Content-Type")).toBe("text/event-stream");
    expect(response.headers.get("Cache-Control")).toContain("no-cache");
    expect(response.headers.get("X-Accel-Buffering")).toBe("no");
  });
});
