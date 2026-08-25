-- Add the Twilio resource identifier without changing existing phone records.
ALTER TABLE "PhoneNumber" ADD COLUMN "twilioPhoneNumberSid" TEXT;

CREATE UNIQUE INDEX "PhoneNumber_twilioPhoneNumberSid_key"
  ON "PhoneNumber"("twilioPhoneNumberSid");
