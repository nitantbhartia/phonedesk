-- AlterTable: add leadId to PublicDemoAttempt
ALTER TABLE "PublicDemoAttempt" ADD COLUMN "leadId" TEXT;

-- CreateIndex for leadId
CREATE INDEX "PublicDemoAttempt_leadId_idx" ON "PublicDemoAttempt"("leadId");

-- AlterIndex: add callerPhone index if not already present
CREATE INDEX IF NOT EXISTS "PublicDemoAttempt_callerPhone_idx" ON "PublicDemoAttempt"("callerPhone");

-- CreateTable: DemoLead
CREATE TABLE "DemoLead" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "businessName" TEXT,
    "ipAtCreation" TEXT NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "lastDemoAt" TIMESTAMP(3),
    "cooldownUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DemoLead_pkey" PRIMARY KEY ("id")
);

-- CreateTable: DemoMagicToken
CREATE TABLE "DemoMagicToken" (
    "id" TEXT NOT NULL,
    "leadId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoMagicToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoLead_email_key" ON "DemoLead"("email");
CREATE INDEX "DemoLead_email_idx" ON "DemoLead"("email");
CREATE INDEX "DemoLead_cooldownUntil_idx" ON "DemoLead"("cooldownUntil");

-- CreateIndex
CREATE UNIQUE INDEX "DemoMagicToken_token_key" ON "DemoMagicToken"("token");
CREATE INDEX "DemoMagicToken_token_idx" ON "DemoMagicToken"("token");

-- AddForeignKey
ALTER TABLE "PublicDemoAttempt" ADD CONSTRAINT "PublicDemoAttempt_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "DemoLead"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DemoMagicToken" ADD CONSTRAINT "DemoMagicToken_leadId_fkey"
    FOREIGN KEY ("leadId") REFERENCES "DemoLead"("id") ON DELETE CASCADE ON UPDATE CASCADE;
