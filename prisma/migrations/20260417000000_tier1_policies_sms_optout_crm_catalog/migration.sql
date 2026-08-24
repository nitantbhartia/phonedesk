-- AlterTable: Add flexible policies JSON to Business
ALTER TABLE "Business" ADD COLUMN "policies" JSONB;

-- AlterTable: Add SMS opt-out flag to Customer
ALTER TABLE "Customer" ADD COLUMN "smsOptOut" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable: Add CRM catalog ID to Service for ID-based matching
ALTER TABLE "Service" ADD COLUMN "crmCatalogId" TEXT;
