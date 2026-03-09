-- Add isAddon flag to Service for AI upsell feature
ALTER TABLE "Service" ADD COLUMN "isAddon" BOOLEAN NOT NULL DEFAULT false;
