/**
 * GET /api/demo/spawkles/stream?token={sessionToken}
 *
 * Server-Sent Events stream that polls the most recent Spawkles call
 * and pushes phase transitions (waiting → in_progress → completed).
 */

import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";

export const dynamic = "force-dynamic";

const MAX_DURATION_MS = 270_000; // 270 s (under Vercel 300 s limit)
const POLL_INTERVAL_MS = 2_000;

function sseChunk(data: object): Uint8Array {
  return new TextEncoder().encode(`data: ${JSON.stringify(data)}\n\n`);
}

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export async function GET(req: NextRequest) {
  const token = req.nextUrl.searchParams.get("token");
  if (!token) {
    return new Response("Missing token", { status: 400 });
  }

  const bizId = process.env.SPAWKLES_BUSINESS_ID;

  let cancelled = false;

  const stream = new ReadableStream({
    async start(controller) {
      const deadline = Date.now() + MAX_DURATION_MS;

      const enqueue = (data: object) => {
        try {
          controller.enqueue(sseChunk(data));
        } catch {
          cancelled = true;
        }
      };

      while (!cancelled && Date.now() < deadline) {
        try {
          const attempt = await prisma.publicDemoAttempt.findUnique({
            where: { sessionToken: token },
          });

          if (!attempt) {
            enqueue({ phase: "error", message: "Session not found" });
            break;
          }

          if (!bizId) {
            enqueue({ phase: "waiting" });
            await sleep(POLL_INTERVAL_MS);
            continue;
          }

          const callerPhone = attempt.callerPhone
            ? normalizePhoneNumber(attempt.callerPhone)
            : null;

          // Look up the most recent call for this business since the session started.
          // When callerPhone is not yet set (Spawkles uses PhoneNumber table, not DemoNumber,
          // so the webhook never populates it), fall back to a business + time-window query.
          const call = await prisma.call.findFirst({
            where: callerPhone
              ? {
                  businessId: bizId,
                  createdAt: { gte: attempt.startedAt },
                  OR: [{ callerPhone }, { callerPhone: attempt.callerPhone }],
                }
              : {
                  businessId: bizId,
                  createdAt: { gte: attempt.startedAt },
                },
            orderBy: { createdAt: "desc" },
          });

          if (!call) {
            enqueue({ phase: "waiting" });
            await sleep(POLL_INTERVAL_MS);
            continue;
          }

          const terminal = ["COMPLETED", "NO_BOOKING", "MISSED"].includes(call.status);

          if (terminal) {
            enqueue({
              phase: "completed",
              summary: call.summary ?? null,
              transcriptObject: call.transcriptObject ?? null,
            });
            break;
          } else {
            enqueue({ phase: "in_progress" });
            await sleep(POLL_INTERVAL_MS);
          }
        } catch (err) {
          console.error("[spawkles/stream] poll error:", err);
          await sleep(POLL_INTERVAL_MS);
        }
      }

      if (!cancelled && Date.now() >= deadline) {
        enqueue({ phase: "timeout" });
      }

      try {
        controller.close();
      } catch { /* already closed */ }
    },
    cancel() {
      cancelled = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
