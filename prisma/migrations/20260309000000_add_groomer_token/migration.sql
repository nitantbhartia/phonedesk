-- AddColumn: groomer status update token (public link, no auth required)
ALTER TABLE "Appointment" ADD COLUMN "groomerToken" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Appointment_groomerToken_key" ON "Appointment"("groomerToken");

-- AddColumn: optional groomer phone for SMS notifications
ALTER TABLE "Groomer" ADD COLUMN "phone" TEXT;
