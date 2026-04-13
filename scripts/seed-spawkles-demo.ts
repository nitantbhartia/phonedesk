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
  provisionRetellPhoneNumber,
  updateRetellPhoneNumber,
  buildAgentTools,
} from "../src/lib/retell";
import { seedBreedRecommendations } from "../src/lib/breed-recommendations";
import { hashPassword } from "../src/lib/password";

const SPAWKLES_BUSINESS_NAME = "Spawkles Mobile Dog Grooming";
const SPAWKLES_EMAIL = "info@spawkles.com";
const SPAWKLES_TEMP_PASSWORD = "Spawkles2024!";

const CUSTOM_GREETING =
  "Thanks for calling Spawkles Mobile Dog Grooming! This is Pip, how can I help you today?";

const RETELL_BASE_URL = "https://api.retellai.com";

/**
 * Direct Retell API fetch for settings that the shared updateRetellAgent /
 * updateRetellLLM helpers don't expose (responsiveness, backchannel, temperature).
 */
async function retellPatch(path: string, body: Record<string, unknown>): Promise<void> {
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) throw new Error("RETELL_API_KEY not set");
  const res = await fetch(`${RETELL_BASE_URL}${path}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Retell API error (${path}): ${err}`);
  }
}

// ── Custom system prompt for Spawkles ────────────────────────────────────────
//
// Instead of patching the generated prompt (which is designed for booking agents),
// we replace it entirely with a shorter, conversational intake-only prompt.
// Pip's job: answer questions, collect details, hand off to Shirine.

function buildSpawklesPrompt(serviceList: string, breedGuide: string): string {
  return `You are Pip, the friendly phone receptionist for Spawkles Mobile Dog Grooming. Shirine and her team come to the customer's home in a fully equipped grooming van — one dog at a time, no cages, no waiting. You answer calls when Shirine is busy grooming.

Your job is to warmly welcome callers, answer their questions, and collect the details Shirine needs to schedule an appointment. You don't book directly — you gather the info and Shirine's team confirms everything.

Business: Spawkles Mobile Dog Grooming
Owner: Shirine
Hours: Monday through Saturday, 8am to 5pm
Location: Mobile service covering San Diego County
Services (use get_services for live prices):
${serviceList}

About mobile grooming — weave these naturally when relevant, don't list them:
Spawkles comes right to your door in a professional grooming van. Your dog gets one-on-one attention the entire time — no other dogs, no cages, no stressful salon visits. Most appointments take about 60 to 90 minutes. It's especially great for anxious dogs who don't do well with car rides or busy salons.

Service area:
Pacific Beach, Mission Beach, La Jolla, Clairemont, Ocean Beach, Point Loma, Hillcrest, North Park, Del Mar, Encinitas, Carlsbad, Mission Valley, Coronado, Chula Vista, and surrounding areas. If a caller is in an unlisted area, say "Let me get your info and we'll check if we can get out there."

Pricing:
Grooming starts at around $120 for a full groom, but the exact price depends on the dog's size, breed, and coat. Use prices from get_services as a starting point, but always say Shirine will confirm the final price.
---
Personality
Warm, unhurried, genuinely interested in the caller and their dog. Slightly casual but professional. Use contractions — "I'll", "you're", "that's", "don't". Keep sentences short. One idea per sentence.

Use a period or em-dash to end sentences, not exclamation marks (save those for genuine warmth). Rotate your acknowledgments — "Perfect", "Great", "Got it", "Sounds good" — don't repeat the same one twice.

When a caller mentions their dog's name, use it right away and keep using it. When they mention a breed, add a brief warm comment if it feels natural.

Mirror the caller's energy — chatty caller, be chatty. Brief caller, be efficient.

When you're about to use a tool, say a short bridging phrase first — "Let me pull that up" or "One sec" — then wait for the result before continuing.
---
One question at a time
Ask one question per turn, then stop and wait. If the caller gives you several details at once, acknowledge all of them, then ask about whatever's still missing.
---
Call flow

Step 1 — When the caller first speaks, call get_current_datetime, lookup_customer_context, and get_services together. Don't speak until they complete.

Step 2 — Don't re-introduce yourself (the greeting already played). Pick up where the conversation left off.
If returning customer: "Hey [Name] — good to hear from you. Are we booking for [Dog Name] again?"
If new customer: Acknowledge what they said and start collecting info.

Step 3 — Collect what you need, one question at a time. Skip anything already known:
- Caller's name
- Dog's name
- Breed
- Size (small, medium, large, extra large)
- What service they're interested in (use names from get_services)
- Neighborhood or area in San Diego
- Preferred day and time

Step 4 — Once you have everything, wrap up:
"I've got everything for Shirine's team. They'll reach out shortly to confirm the appointment details and pricing. Is there anything else I can help with?"

Then ask if there's anything else. If not, close with one warm sentence that mentions the dog by name — "We can't wait to see [Dog Name]!" — then call add_call_note and end_call.
---
Questions about pricing
Use the prices from get_services as a reference, but frame them as "starts at" — the final price depends on the dog. Let Shirine confirm.

Questions about how mobile grooming works
"Our groomer comes right to your home in a fully equipped van. Your pup gets one-on-one attention the whole time — no cages, no other dogs. Most appointments take about an hour to an hour and a half."

Questions about service area
Mention a few neighborhoods naturally, then ask which area they're in.

Questions you can't answer
"Great question — let me make sure you get the right answer. I'll have Shirine reach out to you. What's the best number?"

If the caller asks whether this is AI
"I'm Pip, the phone receptionist for Spawkles — I help with calls so Shirine can focus on the dogs. I'd love to get your details and have Shirine's team follow up with you."

If the caller wants a real person
"Of course — I'll let Shirine know. She'll call you back as soon as she's free." Confirm the best callback number, then call add_call_note and end_call.

After hours
"Thanks for calling Spawkles! We're closed right now — our hours are Monday through Saturday, 8am to 5pm. But I'd love to get your info so Shirine can reach out first thing."
${breedGuide}`;
}

function patchSystemPrompt(basePrompt: string, fullBusiness: {
  services: { isActive: boolean; name: string; price: number; duration: number }[];
  breedRecommendations: { breedKeyword: string; recommendedServiceKeyword: string; reason: string; priority: number }[];
}): string {
  // Build the service list from the business data
  const serviceList = fullBusiness.services
    .filter((s) => s.isActive)
    .map((s) => `- ${s.name}: $${s.price} (${s.duration} min)`)
    .join("\n");

  // Build breed guide if recommendations exist
  let breedGuide = "";
  if (fullBusiness.breedRecommendations.length > 0) {
    const sorted = [...fullBusiness.breedRecommendations].sort((a, b) => b.priority - a.priority);
    const lines = sorted.map(
      (r) => `- "${r.breedKeyword}" → recommend ${r.recommendedServiceKeyword} (${r.reason})`
    );
    breedGuide = `\n---\nBreed recommendations — when a caller mentions a breed that matches, suggest that service warmly before asking what they want. Be helpful, not pushy.\n${lines.join("\n")}`;
  }

  // Ignore the base prompt entirely — use the custom Spawkles prompt
  void basePrompt;
  return buildSpawklesPrompt(serviceList, breedGuide);
}

async function main() {
  console.log("🐾 Seeding Spawkles Mobile Dog Grooming demo...\n");

  // 1. Demo user — migrate from old internal email if it exists
  const OLD_EMAIL = "spawkles@ringpaw.internal";
  const passwordHash = hashPassword(SPAWKLES_TEMP_PASSWORD);

  // Handle three cases:
  //  a) only old user exists → rename it
  //  b) only new user exists → nothing to migrate
  //  c) both exist (partial prior run) → transfer old user's business to new user, delete old
  const oldUser = await prisma.user.findUnique({ where: { email: OLD_EMAIL } });
  const existingNewUser = await prisma.user.findUnique({ where: { email: SPAWKLES_EMAIL } });

  if (oldUser && existingNewUser && oldUser.id !== existingNewUser.id) {
    // Both exist — reassign any Business owned by oldUser to newUser, then delete oldUser.
    // Business.userId is @unique, so if newUser already owns a business, drop that one
    // first (the oldUser's business is the canonical record with phone/config history).
    const oldBiz = await prisma.business.findUnique({ where: { userId: oldUser.id } });
    const newBiz = await prisma.business.findUnique({ where: { userId: existingNewUser.id } });
    if (oldBiz && newBiz) {
      // Prefer oldUser's business (has live Retell/phone linkage). Delete newUser's empty stub.
      await prisma.business.delete({ where: { id: newBiz.id } });
    }
    if (oldBiz) {
      await prisma.business.update({
        where: { id: oldBiz.id },
        data: { userId: existingNewUser.id },
      });
    }
    await prisma.user.delete({ where: { id: oldUser.id } });
    console.log(`✔ Merged legacy user ${OLD_EMAIL} into ${SPAWKLES_EMAIL}`);
  } else if (oldUser && !existingNewUser) {
    await prisma.user.update({
      where: { id: oldUser.id },
      data: { email: SPAWKLES_EMAIL, name: "Shirine", passwordHash },
    });
    console.log(`✔ Migrated user from ${OLD_EMAIL} → ${SPAWKLES_EMAIL}`);
  }

  const user = await prisma.user.upsert({
    where: { email: SPAWKLES_EMAIL },
    create: { email: SPAWKLES_EMAIL, name: "Shirine", passwordHash },
    update: { name: "Shirine", passwordHash },
  });
  console.log(`✔ User:     ${user.email} (${user.id})`);

  // 2. Business
  const business = await prisma.business.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      name: SPAWKLES_BUSINESS_NAME,
      ownerName: "Shirine",
      phone: "6193208837",
      email: "info@spawkles.com",
      address: "Mobile — San Diego County",
      city: "San Diego",
      state: "CA",
      timezone: "America/Los_Angeles",
      bookingMode: "SOFT",
      vaccinePolicy: "FLAG_ONLY",
      isActive: true,
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
      name: SPAWKLES_BUSINESS_NAME,
      ownerName: "Shirine",
      phone: "6193208837",
      email: "info@spawkles.com",
      address: "Mobile — San Diego County",
      city: "San Diego",
      state: "CA",
      timezone: "America/Los_Angeles",
      bookingMode: "SOFT",
      vaccinePolicy: "FLAG_ONLY",
      isActive: true,
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

  // 7. Patch system prompt with intake-only Spawkles prompt
  if (!retellConfig.llmId || !retellConfig.agentId) {
    throw new Error("Retell agent sync did not return llmId or agentId");
  }

  const spawklesPrompt = patchSystemPrompt("", fullBusiness);

  // Strip booking tools — Spawkles is intake-only (Shirine books in GrooMore)
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const INTAKE_ONLY_TOOLS = new Set([
    "get_current_datetime",
    "lookup_customer_context",
    "get_services",
    "add_call_note",
    "business_faq",
    "end_call",
  ]);
  const filteredTools = buildAgentTools(appUrl).filter(
    (t) => INTAKE_ONLY_TOOLS.has(t.name)
  );

  await updateRetellLLM(retellConfig.llmId, {
    generalPrompt: spawklesPrompt,
    beginMessage: CUSTOM_GREETING,
    tools: filteredTools,
  });
  console.log(`✔ Custom Spawkles intake prompt applied (${filteredTools.length} tools, no booking)`);

  // 8. Override LLM temperature (shared updateRetellLLM doesn't expose this)
  await retellPatch(`/update-retell-llm/${retellConfig.llmId}`, {
    model_temperature: 0.4,
  });
  console.log("✔ LLM temperature set to 0.4");

  // 9. Set 4-minute call cap + tune voice settings for naturalness
  //    updateRetellAgent hardcodes responsiveness/backchannel, so we call Retell directly.
  await updateRetellAgent(retellConfig.agentId, {
    maxCallDurationMs: 240_000,
    voiceSpeed: 0.9,
  });
  await retellPatch(`/update-agent/${retellConfig.agentId}`, {
    responsiveness: 0.65,
    backchannel_frequency: 0.2,
  });
  console.log("✔ Voice tuning applied (speed=0.9, responsiveness=0.65, backchannel=0.2)");

  // 10. Reuse an existing dedicated phone number when present.
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
        number: phoneResult.phone_number,
        retellPhoneNumber: phoneResult.phone_number,
        provider: "RETELL",
        isActive: true,
      },
      update: {
        number: phoneResult.phone_number,
        retellPhoneNumber: phoneResult.phone_number,
        isActive: true,
      },
    });

    console.log(`✔ Phone number provisioned: ${formatPhone(phoneResult.phone_number)}`);
  }

  if (!activePhoneNumber) {
    throw new Error("Failed to resolve an active phone number for Spawkles");
  }

  // 10. Detach any legacy Spawkles phone numbers so only the active line is routed.
  const legacySpawklesBusinesses = await prisma.business.findMany({
    where: {
      name: SPAWKLES_BUSINESS_NAME,
      id: { not: business.id },
    },
    include: {
      phoneNumber: true,
    },
  });

  for (const legacyBusiness of legacySpawklesBusinesses) {
    const legacyNumber = legacyBusiness.phoneNumber?.retellPhoneNumber;
    if (!legacyNumber || legacyNumber === activePhoneNumber) continue;

    await updateRetellPhoneNumber(legacyNumber, {
      inboundAgentId: null,
      nickname: "Spawkles Demo — RingPaw (Detached)",
    });
    console.log(`✔ Detached legacy Spawkles number: ${formatPhone(legacyNumber)}`);
  }

  const formatted = formatPhone(activePhoneNumber);

  // 11. Done
  console.log(`
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅  Spawkles demo ready!

Add these to your production environment:

  SPAWKLES_BUSINESS_ID=${business.id}

Demo phone number: ${formatted}
Agent ID: ${retellConfig.agentId}

Demo page: /demo/spawkles

Dashboard login:
  Email:    ${SPAWKLES_EMAIL}
  Password: ${SPAWKLES_TEMP_PASSWORD}
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
