-- Add MoeGo to CalendarProvider enum
ALTER TYPE "CalendarProvider" ADD VALUE IF NOT EXISTS 'MOEGO';

-- Add MoeGo customer ID to Customer for write-back
ALTER TABLE "Customer" ADD COLUMN IF NOT EXISTS "moegoCustomerId" TEXT;
