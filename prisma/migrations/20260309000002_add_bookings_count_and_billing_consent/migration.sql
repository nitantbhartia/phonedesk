-- AlterTable
ALTER TABLE "Business" ADD COLUMN "bookingsCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "Business" ADD COLUMN "billingConsentGiven" BOOLEAN NOT NULL DEFAULT false;
