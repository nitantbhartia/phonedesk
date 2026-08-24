-- Bookable funnel analytics + session audit fields

CREATE TABLE "BookableFunnelEvent" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "sessionId" TEXT,
    "callId" TEXT,
    "event" TEXT NOT NULL,
    "digit" TEXT,
    "elapsedMs" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BookableFunnelEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "BookableFunnelEvent_businessId_event_createdAt_idx" ON "BookableFunnelEvent"("businessId", "event", "createdAt");
CREATE INDEX "BookableFunnelEvent_sessionId_idx" ON "BookableFunnelEvent"("sessionId");

ALTER TABLE "BookableFunnelEvent" ADD CONSTRAINT "BookableFunnelEvent_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "BookableSession" ADD COLUMN "slotSelected" JSONB;
ALTER TABLE "BookableSession" ADD COLUMN "invalidAttempts" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "BookableSession" ADD COLUMN "callStartedAt" TIMESTAMP(3);
ALTER TABLE "BookableSession" ADD COLUMN "usualServiceId" TEXT;
ALTER TABLE "BookableSession" ADD COLUMN "usualPetName" TEXT;
