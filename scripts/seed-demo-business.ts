/**
 * Creates the demo grooming business used by the public /demo page.
 *
 * Run once in production after setting DATABASE_URL and RETELL_API_KEY:
 *
 *   npx tsx scripts/seed-demo-business.ts
 *
 * The script prints the business ID at the end — paste it into your
 * production env as DEMO_BUSINESS_ID then redeploy.
 *
 * Safe to re-run: uses upsert so it won't create duplicates.
 */

import { prisma } from "../src/lib/prisma";
import { syncRetellAgent } from "../src/lib/retell";
import { seedBreedRecommendations } from "../src/lib/breed-recommendations";

const DEMO_EMAIL = "demo@ringpaw.internal";

async function main() {
  console.log("🐾 Seeding demo business...\n");

  // 1. Demo user (internal account, no password needed)
  const user = await prisma.user.upsert({
    where: { email: DEMO_EMAIL },
    create: { email: DEMO_EMAIL, name: "RingPaw Demo" },
    update: {},
  });
  console.log(`✔ User:     ${user.email} (${user.id})`);

  // 2. Business
  const business = await prisma.business.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      name: "Bella's Paw Spa",
      ownerName: "Bella",
      phone: "4155550192",
      address: "2847 Market St",
      city: "San Francisco",
      state: "CA",
      timezone: "America/Los_Angeles",
      bookingMode: "SOFT",
      isActive: false,        // demo business never goes "live"
      onboardingComplete: true,
      businessHours: {
        mon: { open: "09:00", close: "18:00" },
        tue: { open: "09:00", close: "18:00" },
        wed: { open: "09:00", close: "18:00" },
        thu: { open: "09:00", close: "18:00" },
        fri: { open: "09:00", close: "18:00" },
        sat: { open: "09:00", close: "16:00" },
      },
    },
    update: {
      name: "Bella's Paw Spa",
      ownerName: "Bella",
      phone: "4155550192",
      address: "2847 Market St",
      city: "San Francisco",
      state: "CA",
      timezone: "America/Los_Angeles",
      businessHours: {
        mon: { open: "09:00", close: "18:00" },
        tue: { open: "09:00", close: "18:00" },
        wed: { open: "09:00", close: "18:00" },
        thu: { open: "09:00", close: "18:00" },
        fri: { open: "09:00", close: "18:00" },
        sat: { open: "09:00", close: "16:00" },
      },
    },
  });
  console.log(`✔ Business: ${business.name} (${business.id})`);

  // 3. Services — deactivate any stale ones first, then upsert current set
  await prisma.service.updateMany({
    where: { businessId: business.id },
    data: { isActive: false },
  });

  const services = [
    { name: "Full Groom",          price: 85,  duration: 120 },
    { name: "Bath & Brush",        price: 55,  duration: 75  },
    { name: "Puppy Bath",          price: 45,  duration: 60  },
    { name: "Nail Trim",           price: 22,  duration: 20  },
    { name: "De-Shed Treatment",   price: 65,  duration: 90  },
    { name: "Teeth Brushing",      price: 18,  duration: 15, isAddon: true },
    { name: "Blueberry Facial",    price: 15,  duration: 10, isAddon: true },
  ];

  for (const svc of services) {
    await prisma.service.create({
      data: {
        businessId: business.id,
        name: svc.name,
        price: svc.price,
        duration: svc.duration,
        isAddon: svc.isAddon ?? false,
        isActive: true,
      },
    });
  }
  console.log(`✔ Services: ${services.map((s) => s.name).join(", ")}`);

  // 4. Breed recommendations
  await seedBreedRecommendations(business.id, prisma);
  console.log("✔ Breed recommendations seeded");

  // 5. Sync Retell agent — creates the LLM + agent if they don't exist yet
  const fullBusiness = await prisma.business.findUnique({
    where: { id: business.id },
    include: {
      services: { where: { isActive: true } },
      groomers: { where: { isActive: true } },
      retellConfig: true,
      breedRecommendations: { orderBy: { priority: "desc" } },
    },
  });

  if (!fullBusiness) throw new Error("Business not found after upsert");

  console.log("⏳ Syncing Retell agent (this calls the Retell API)...");
  const synced = await syncRetellAgent(fullBusiness);
  console.log(`✔ Retell agent synced (agentId: ${synced.agentId})`);

  // 6. Done
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Demo business ready!

Add this to your production environment:

  DEMO_BUSINESS_ID=${business.id}

Then redeploy for the /demo page to go live.
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
