-- CreateTable
CREATE TABLE "DemoNumber" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "retellPhoneNumber" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoNumber_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DemoSession" (
    "id" TEXT NOT NULL,
    "demoNumberId" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DemoSession_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DemoNumber_number_key" ON "DemoNumber"("number");

-- CreateIndex
CREATE UNIQUE INDEX "DemoNumber_retellPhoneNumber_key" ON "DemoNumber"("retellPhoneNumber");

-- CreateIndex
CREATE UNIQUE INDEX "DemoSession_businessId_key" ON "DemoSession"("businessId");

-- AddForeignKey
ALTER TABLE "DemoSession" ADD CONSTRAINT "DemoSession_demoNumberId_fkey" FOREIGN KEY ("demoNumberId") REFERENCES "DemoNumber"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
