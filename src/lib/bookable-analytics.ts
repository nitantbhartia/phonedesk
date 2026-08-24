import { prisma } from "@/lib/prisma";

export const BOOKABLE_FUNNEL_EVENTS = [
  "call_forwarded",
  "menu_started",
  "menu_digit_pressed",
  "booking_selected",
  "service_selected",
  "pricing_heard",
  "slots_requested",
  "slots_presented",
  "slot_selected",
  "booking_started",
  "booking_succeeded",
  "booking_failed",
  "sms_sent",
  "callback_selected",
  "voicemail_recorded",
  "call_abandoned",
] as const;

export type BookableFunnelEventName = (typeof BOOKABLE_FUNNEL_EVENTS)[number];

export async function trackBookableEvent(input: {
  businessId: string;
  sessionId?: string | null;
  callId?: string | null;
  event: BookableFunnelEventName;
  digit?: string | null;
  callStartedAt?: Date | null;
  metadata?: Record<string, unknown>;
}) {
  const elapsedMs =
    input.callStartedAt != null
      ? Math.max(0, Date.now() - input.callStartedAt.getTime())
      : undefined;

  try {
    await prisma.bookableFunnelEvent.create({
      data: {
        businessId: input.businessId,
        sessionId: input.sessionId || undefined,
        callId: input.callId || undefined,
        event: input.event,
        digit: input.digit || undefined,
        elapsedMs,
        metadata: input.metadata || undefined,
      },
    });
  } catch (error) {
    console.error("[bookable-analytics] track failed:", error);
  }
}

export type FunnelDropoff = {
  event: string;
  count: number;
  dropoffPct: number;
};

const FUNNEL_ORDER: BookableFunnelEventName[] = [
  "call_forwarded",
  "menu_started",
  "booking_selected",
  "service_selected",
  "slots_presented",
  "slot_selected",
  "booking_succeeded",
];

export async function getBookableFunnelDropoff(
  businessId: string,
  since: Date
): Promise<FunnelDropoff[]> {
  const counts = await prisma.bookableFunnelEvent.groupBy({
    by: ["event"],
    where: { businessId, createdAt: { gte: since } },
    _count: { event: true },
  });

  const byEvent = new Map(counts.map((row) => [row.event, row._count.event]));
  const ordered = FUNNEL_ORDER.map((event) => ({
    event,
    count: byEvent.get(event) || 0,
    dropoffPct: 0,
  }));

  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1].count;
    const curr = ordered[i].count;
    if (prev > 0) {
      ordered[i].dropoffPct = Math.round(((prev - curr) / prev) * 100);
    }
  }

  return ordered;
}

export async function getBookableFunnelSummary(businessId: string, since: Date) {
  const [events, dropoff] = await Promise.all([
    prisma.bookableFunnelEvent.groupBy({
      by: ["event"],
      where: { businessId, createdAt: { gte: since } },
      _count: { event: true },
      _avg: { elapsedMs: true },
    }),
    getBookableFunnelDropoff(businessId, since),
  ]);

  return {
    events: events.map((row) => ({
      event: row.event,
      count: row._count.event,
      avgElapsedMs: row._avg.elapsedMs ? Math.round(row._avg.elapsedMs) : null,
    })),
    dropoff,
  };
}
