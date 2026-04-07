/**
 * Creates a custom RingPaw demo for Spawkles Mobile Dog Grooming (San Diego).
 *
 * Run once in production after setting DATABASE_URL and RETELL_API_KEY:
 *
 *   npx tsx scripts/seed-spawkles-demo.ts
 *
 * The script prints the business ID and phone number at the end — paste them
 * into your production env as SPAWKLES_BUSINESS_ID then redeploy.
 *
 * Safe to re-run: uses upsert so it won't create duplicates.
 */

import { prisma } from "../src/lib/prisma";
import {
  syncRetellAgent,
  updateRetellLLM,
  updateRetellAgent,
  generateSystemPrompt,
  provisionRetellPhoneNumber,
  updateRetellPhoneNumber,
} from "../src/lib/retell";
import { seedBreedRecommendations } from "../src/lib/breed-recommendations";

const SPAWKLES_EMAIL = "spawkles@ringpaw.internal";

const CUSTOM_GREETING =
  "Thanks for calling Spawkles Mobile Dog Grooming! This is Pip, how can I help you today?";

// ── Mobile grooming context injected after the IDENTITY & ROLE section ──────

const MOBILE_GROOMING_CONTEXT = `---
MOBILE GROOMING — KEY CONTEXT
Spawkles Mobile Dog Grooming is a mobile service. Shirine and her team come to the customer's home in a fully equipped professional grooming van.
Key selling points (weave naturally into conversation when relevant — never recite as a list):
- One-on-one grooming — your dog is the only one being groomed the entire time
- No cages, no waiting around with other dogs
- Great for anxious or reactive dogs who don't do well at traditional salons
- Convenient — grooming comes right to your door, no car ride needed
- Professional salon-quality equipment inside the van
- Most appointments take about 60 to 90 minutes
---
SERVICE AREA
Spawkles serves the following neighborhoods in San Diego County: Pacific Beach, Mission Beach, La Jolla, Clairemont, Ocean Beach, Point Loma, Hillcrest, North Park, Del Mar, Encinitas, Carlsbad, Mission Valley, Coronado, Chula Vista, and surrounding San Diego areas.
When a caller asks about the service area, mention specific neighborhoods naturally: "We cover most of San Diego County! We regularly groom in Pacific Beach, La Jolla, North Park, Del Mar, Carlsbad, Coronado, and lots more. What neighborhood are you in?"
IMPORTANT: If the caller is in an area not on the list, NEVER say they are outside the service area. Instead say: "Let me take your info and we'll check if we can get to your area!"
---
PRICING RULES
All grooming prices start at the base rate and vary based on the dog's size, breed, and coat condition. When asked about pricing, say "starts at around $120 for a full groom" or similar — never commit to an exact final price. Say: "The exact price depends on your pup's size and coat, but Shirine will confirm that with you when she reaches out."
---
MOBILE BOOKING — ADDRESS COLLECTION
Since Spawkles comes to the customer, always ask for their neighborhood or area during the booking flow. You do NOT need a full street address — the neighborhood is enough for Pip. Shirine's team will collect the exact address when confirming.
---
BOOKING SYSTEM NOTE
Spawkles uses an external booking system that Pip cannot access directly. Your job is to collect all the booking details and send them to Shirine's team. After collecting everything, say: "I've got all your details. Shirine's team will reach out shortly to confirm your appointment and the final price. Is there anything else I can help with?"
Never promise that the appointment is confirmed — always frame it as "Shirine's team will confirm."`;

function patchSystemPrompt(basePrompt: string): string {
  let prompt = basePrompt;

  // 1. Replace generic business description with mobile grooming context
  prompt = prompt.replace(
    "a pet grooming business",
    "a mobile dog grooming service. Shirine and her team come to the customer's home in a fully equipped grooming van in San Diego County"
  );

  // 2. Inject MOBILE GROOMING CONTEXT after the IDENTITY & ROLE section
  const identityEndMarker = "---\nPERSONALITY & TONE";
  prompt = prompt.replace(
    identityEndMarker,
    `${MOBILE_GROOMING_CONTEXT}\n${identityEndMarker}`
  );

  // 3. Add neighborhood collection to Step 3
  prompt = prompt.replace(
    "- Preferred day and time",
    "- Neighborhood or area in San Diego (confirm it's in the service area)\n- Preferred day and time"
  );

  // 4. Modify Step 7 close for mobile/SOFT booking
  prompt = prompt.replace(
    `"I'll get that on the calendar and the owner will send you a confirmation shortly."`,
    `"I've got all the details for Shirine. She'll reach out shortly to confirm your appointment and the final price."`
  );

  return prompt;
}

async function main() {
  console.log("🐾 Seeding Spawkles Mobile Dog Grooming demo...\n");

  // 1. Demo user (internal account, no password needed)
  const user = await prisma.user.upsert({
    where: { email: SPAWKLES_EMAIL },
    create: { email: SPAWKLES_EMAIL, name: "Spawkles Demo" },
    update: {},
  });
  console.log(`✔ User:     ${user.email} (${user.id})`);

  // 2. Business
  const business = await prisma.business.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      name: "Spawkles Mobile Dog Grooming",
      ownerName: "Shirine",
      phone: "6193208837",
      email: "info@spawkles.com",
      address: "Mobile — San Diego County",
      city: "San Diego",
      state: "CA",
      timezone: "America/Los_Angeles",
      bookingMode: "SOFT",
      vaccinePolicy: "FLAG_ONLY",
      isActive: false,
      onboardingComplete: true,
      businessHours: {
        mon: { open: "08:00", close: "17:00" },
        tue: { open: "08:00", close: "17:00" },
        wed: { open: "08:00", close: "17:00" },
        thu: { open: "08:00", close: "17:00" },
        fri: { open: "08:00", close: "17:00" },
        sat: { open: "08:00", close: "17:00" },
      },
    },
    update: {
      name: "Spawkles Mobile Dog Grooming",
      ownerName: "Shirine",
      phone: "6193208837",
      email: "info@spawkles.com",
      address: "Mobile — San Diego County",
      city: "San Diego",
      state: "CA",
      timezone: "America/Los_Angeles",
      bookingMode: "SOFT",
      vaccinePolicy: "FLAG_ONLY",
      businessHours: {
        mon: { open: "08:00", close: "17:00" },
        tue: { open: "08:00", close: "17:00" },
        wed: { open: "08:00", close: "17:00" },
        thu: { open: "08:00", close: "17:00" },
        fri: { open: "08:00", close: "17:00" },
        sat: { open: "08:00", close: "17:00" },
      },
    },
  });
  console.log(`✔ Business: ${business.name} (${business.id})`);

  // 3. Services — deactivate stale ones first, then create current set
  await prisma.service.updateMany({
    where: { businessId: business.id },
    data: { isActive: false },
  });

  const services = [
    { name: "Full Service Grooming", price: 120, duration: 120 },
    { name: "Bath & Blow Dry",       price: 65,  duration: 60  },
    { name: "Puppy Grooming",        price: 80,  duration: 75  },
    { name: "Nail Trim",             price: 25,  duration: 15, isAddon: true },
    { name: "Ear Cleaning",          price: 20,  duration: 15, isAddon: true },
    { name: "De-Shedding Treatment", price: 45,  duration: 45, isAddon: true },
    { name: "Sanitary Trim",         price: 30,  duration: 20, isAddon: true },
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

  // 5. Sync Retell agent — creates the LLM + agent
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
  const retellConfig = await syncRetellAgent(fullBusiness);
  console.log(`✔ Retell agent synced (agentId: ${retellConfig.agentId})`);

  // 6. Set custom greeting
  await prisma.retellConfig.update({
    where: { businessId: business.id },
    data: { greeting: CUSTOM_GREETING },
  });

  // 7. Patch system prompt with mobile grooming specifics
  if (!retellConfig.llmId || !retellConfig.agentId) {
    throw new Error("Retell agent sync did not return llmId or agentId");
  }

  const basePrompt = generateSystemPrompt(fullBusiness);
  const patchedPrompt = patchSystemPrompt(basePrompt);

  await updateRetellLLM(retellConfig.llmId, {
    generalPrompt: patchedPrompt,
    beginMessage: CUSTOM_GREETING,
  });
  console.log("✔ Custom greeting and mobile grooming prompt applied");

  // 8. Set 2-minute call cap for demo
  await updateRetellAgent(retellConfig.agentId, {
    maxCallDurationMs: 120_000,
  });
  console.log("✔ Call cap set to 2 minutes");

  // 9. Reuse an existing dedicated phone number when present.
  // Only provision a new number the very first time this demo is created.
  const existingPhone = await prisma.phoneNumber.findUnique({
    where: { businessId: business.id },
  });

  let activePhoneNumber = existingPhone?.retellPhoneNumber || existingPhone?.number || null;

  if (existingPhone?.retellPhoneNumber) {
    await updateRetellPhoneNumber(existingPhone.retellPhoneNumber, {
      inboundAgentId: retellConfig.agentId,
      nickname: "Spawkles Demo — RingPaw",
    });
    console.log(`✔ Reused existing phone number: ${formatPhone(existingPhone.retellPhoneNumber)}`);
  } else {
    const SD_AREA_CODES = [619, 858, 760];
    let phoneResult: { phone_number: string } | null = null;

    for (const areaCode of SD_AREA_CODES) {
      try {
        phoneResult = await provisionRetellPhoneNumber({
          agentId: retellConfig.agentId,
          areaCode,
          nickname: "Spawkles Demo — RingPaw",
        });
        break;
      } catch (err) {
        const msg = err instanceof Error ? err.message : "";
        if (msg.includes("No phone numbers")) {
          console.log(`  ⚠ No numbers available for area code ${areaCode}, trying next...`);
          continue;
        }
        throw err;
      }
    }

    if (!phoneResult) {
      console.log("  ⚠ No San Diego area codes available, using fallback...");
      phoneResult = await provisionRetellPhoneNumber({
        agentId: retellConfig.agentId,
        nickname: "Spawkles Demo — RingPaw",
      });
    }

    activePhoneNumber = phoneResult.phone_number;

    await prisma.phoneNumber.upsert({
      where: { businessId: business.id },
      create: {
        businessId: business.id,
        number: phoneResult.phone_number.replace(/\D/g, ""),
        retellPhoneNumber: phoneResult.phone_number,
        provider: "RETELL",
        isActive: true,
      },
      update: {
        number: phoneResult.phone_number.replace(/\D/g, ""),
        retellPhoneNumber: phoneResult.phone_number,
        isActive: true,
      },
    });

    console.log(`✔ Phone number provisioned: ${formatPhone(phoneResult.phone_number)}`);
  }

  if (!activePhoneNumber) {
    throw new Error("Failed to resolve an active phone number for Spawkles");
  }

  const formatted = formatPhone(activePhoneNumber);

  // 10. Done
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Spawkles demo ready!

Add these to your production environment:

  SPAWKLES_BUSINESS_ID=${business.id}

Demo phone number: ${formatted}
Agent ID: ${retellConfig.agentId}

Demo page will be live at: /demo/spawkles
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
}

function formatPhone(raw: string): string {
  const d = raw.replace(/\D/g, "");
  if (d.length === 11 && d.startsWith("1")) {
    return `(${d.slice(1, 4)}) ${d.slice(4, 7)}-${d.slice(7)}`;
  }
  if (d.length === 10) {
    return `(${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }
  return raw;
}

main()
  .catch((err) => {
    console.error("❌ Seed failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
