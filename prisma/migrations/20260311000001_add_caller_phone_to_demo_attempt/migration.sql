-- AlterTable
ALTER TABLE "PublicDemoAttempt" ADD COLUMN "callerPhone" TEXT;

-- CreateIndex
CREATE INDEX "PublicDemoAttempt_callerPhone_idx" ON "PublicDemoAttempt"("callerPhone");
