-- CreateTable
CREATE TABLE "PublicDemoAttempt" (
    "id" TEXT NOT NULL,
    "ip" TEXT NOT NULL,
    "sessionToken" TEXT NOT NULL,
    "demoNumberId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PublicDemoAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PublicDemoAttempt_sessionToken_key" ON "PublicDemoAttempt"("sessionToken");

-- CreateIndex
CREATE INDEX "PublicDemoAttempt_ip_idx" ON "PublicDemoAttempt"("ip");
