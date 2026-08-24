-- AlterEnum
ALTER TYPE "CallStatus" ADD VALUE IF NOT EXISTS 'CALLBACK';

-- CreateEnum
CREATE TYPE "InboundPath" AS ENUM ('BOOKABLE_VOICEMAIL', 'RETELL_AGENT');

-- CreateEnum
CREATE TYPE "BookableSessionStatus" AS ENUM ('IN_PROGRESS', 'BOOKED', 'REQUESTED', 'CALLBACK', 'NO_SLOTS', 'FAILED');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN "inboundPath" "InboundPath" NOT NULL DEFAULT 'BOOKABLE_VOICEMAIL';

-- CreateTable
CREATE TABLE "BookableSession" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "callId" TEXT,
    "callSid" TEXT NOT NULL,
    "callerPhone" TEXT,
    "calledNumber" TEXT,
    "state" TEXT NOT NULL DEFAULT 'menu',
    "serviceId" TEXT,
    "slotOffset" INTEGER NOT NULL DEFAULT 0,
    "slotsHeard" INTEGER NOT NULL DEFAULT 0,
    "slotsOffered" JSONB,
    "prefetchedSlots" JSONB,
    "status" "BookableSessionStatus" NOT NULL DEFAULT 'IN_PROGRESS',
    "appointmentId" TEXT,
    "calendarEventId" TEXT,
    "smsCustomerStatus" TEXT,
    "smsOwnerStatus" TEXT,
    "recordingUrl" TEXT,
    "knownCaller" BOOLEAN NOT NULL DEFAULT false,
    "bookingKind" TEXT,
    "lastDigit" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BookableSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "BookableSession_callId_key" ON "BookableSession"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "BookableSession_callSid_key" ON "BookableSession"("callSid");

-- CreateIndex
CREATE INDEX "BookableSession_businessId_createdAt_idx" ON "BookableSession"("businessId", "createdAt");

-- CreateIndex
CREATE INDEX "BookableSession_callerPhone_idx" ON "BookableSession"("callerPhone");

-- AddForeignKey
ALTER TABLE "BookableSession" ADD CONSTRAINT "BookableSession_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BookableSession" ADD CONSTRAINT "BookableSession_callId_fkey" FOREIGN KEY ("callId") REFERENCES "Call"("id") ON DELETE SET NULL ON UPDATE CASCADE;
