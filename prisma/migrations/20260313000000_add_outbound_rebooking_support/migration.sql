-- Add outbound rebooking agent fields to RetellConfig
ALTER TABLE "RetellConfig" ADD COLUMN "rebookingAgentId" TEXT;
ALTER TABLE "RetellConfig" ADD COLUMN "rebookingLlmId" TEXT;

-- Add isOutbound flag to Call
ALTER TABLE "Call" ADD COLUMN "isOutbound" BOOLEAN NOT NULL DEFAULT false;
