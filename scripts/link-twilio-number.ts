/**
 * One-off script to link a manually-created Twilio number to a business.
 *
 * Usage:
 *   npx tsx scripts/link-twilio-number.ts
 *
 * Set TWILIO_NUMBER env var to override the default, e.g.:
 *   TWILIO_NUMBER=+18665551234 npx tsx scripts/link-twilio-number.ts
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const TWILIO_NUMBER = process.env.TWILIO_NUMBER || "+18663083721";

async function main() {
  // Check if already linked
  const existing = await prisma.phoneNumber.findUnique({
    where: { number: TWILIO_NUMBER },
  });
  if (existing) {
    console.log(`Number ${TWILIO_NUMBER} is already linked to business ${existing.businessId}`);
    return;
  }

  // Find the business (use the first one that doesn't have a phone number yet)
  const business = await prisma.business.findFirst({
    where: { phoneNumber: null },
    orderBy: { createdAt: "asc" },
  });

  if (!business) {
    // Fallback: find any business
    const anyBusiness = await prisma.business.findFirst({
      orderBy: { createdAt: "asc" },
    });
    if (!anyBusiness) {
      console.error("No businesses found in the database.");
      process.exit(1);
    }
    console.error(`Business "${anyBusiness.name}" already has a phone number. If you want to replace it, delete the existing PhoneNumber record first.`);
    process.exit(1);
  }

  const record = await prisma.phoneNumber.create({
    data: {
      businessId: business.id,
      number: TWILIO_NUMBER,
      provider: "TWILIO",
      isActive: true,
    },
  });

  console.log(`Linked ${TWILIO_NUMBER} to business "${business.name}" (${business.id})`);
  console.log("PhoneNumber record:", record);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
