-- AlterTable: add structured transcript field to Call
ALTER TABLE "Call" ADD COLUMN "transcriptObject" JSONB;
