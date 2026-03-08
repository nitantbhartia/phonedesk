-- CreateTable
CREATE TABLE "Groomer" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "specialties" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Groomer_pkey" PRIMARY KEY ("id")
);

-- AddColumn
ALTER TABLE "Appointment" ADD COLUMN "groomerId" TEXT;

-- AddColumn
ALTER TABLE "Customer" ADD COLUMN "preferredGroomerId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Groomer_businessId_name_key" ON "Groomer"("businessId", "name");

-- AddForeignKey
ALTER TABLE "Customer" ADD CONSTRAINT "Customer_preferredGroomerId_fkey" FOREIGN KEY ("preferredGroomerId") REFERENCES "Groomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Appointment" ADD CONSTRAINT "Appointment_groomerId_fkey" FOREIGN KEY ("groomerId") REFERENCES "Groomer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Groomer" ADD CONSTRAINT "Groomer_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE CASCADE ON UPDATE CASCADE;
