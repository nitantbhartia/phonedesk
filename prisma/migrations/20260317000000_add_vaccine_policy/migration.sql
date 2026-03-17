-- CreateEnum
CREATE TYPE "VaccinePolicy" AS ENUM ('OFF', 'FLAG_ONLY', 'REQUIRE');

-- AlterTable
ALTER TABLE "Business" ADD COLUMN "vaccinePolicy" "VaccinePolicy" NOT NULL DEFAULT 'OFF';

-- AlterTable
ALTER TABLE "Appointment" ADD COLUMN "vaccineStatus" TEXT;
