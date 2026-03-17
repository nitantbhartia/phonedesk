import { prisma } from "./prisma";
import type { Business, BreedRecommendation, RetellConfig, Service, Groomer } from "@prisma/client";

const RETELL_BASE_URL = "https://api.retellai.com";
const RETELL_MODEL = process.env.RETELL_MODEL || "claude-4.6-sonnet";
const DEFAULT_VOICE_ID = "11labs-Grace";
const DEFAULT_VOICE_MODEL = "eleven_turbo_v2_5";
const DEFAULT_VOICE_SPEED = 0.95; // slightly under 1.0 — more unhurried, natural pacing
const DEFAULT_VOLUME = 1.0;

function getRetellApiKey() {
  const key = process.env.RETELL_API_KEY;
  if (!key) throw new Error("Retell API key not configured");
  return key;
}

async function retellFetch(path: string, options: RequestInit = {}) {
  const apiKey = getRetellApiKey();
  const response = await fetch(`${RETELL_BASE_URL}${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      ...options.headers,
    },
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Retell API error (${path}): ${error}`);
  }

  // DELETE returns 204 with no body
  if (response.status === 204) return null;
  return response.json();
}

// --- System Prompt & Greeting ---

function buildBreedGuideSection(recommendations: BreedRecommendation[]): string {
  if (recommendations.length === 0) return "";
  const sorted = [...recommendations].sort((a, b) => b.priority - a.priority);
  const lines = sorted.map(
    (r) =>
      `- Breed contains "${r.breedKeyword}": recommend "${r.recommendedServiceKeyword}". Reason: ${r.reason}`
  );
  return `---
BREED SERVICE GUIDE
After the caller tells you their dog's breed, check if it matches any entry below (case-insensitive substring match). If it does, warmly recommend that service before asking which service they want. Be helpful, not pushy — offer it as friendly expertise.
${lines.join("\n")}
Example: caller says "standard poodle" → "For a standard poodle I'd actually recommend the full groom over the bath and brush — their coats need the extra work. Want to go with that?"
Use the Reason to inform your explanation but rephrase it naturally. Never read the Reason verbatim.`;
}

export function generateSystemPrompt(
  business: Business & { services: Service[]; breedRecommendations: BreedRecommendation[]; groomers?: Groomer[] }
): string {
  const serviceList = business.services
    .filter((s) => s.isActive)
    .map((s) => `- ${s.name}: $${s.price} (${s.duration} minutes)`)
    .join("\n");

  const hours = business.businessHours
    ? formatBusinessHours(
        business.businessHours as Record<
          string,
          { open: string; close: string }
        >
      )
    : "Monday–Friday 9:00 AM–5:00 PM";

  const serviceNames = business.services
    .filter((s) => s.isActive)
    .map((s) => s.name.toLowerCase().replace(/s$/, ""))
    .join(", ");

  const serviceListNatural = serviceNames || "full grooms, bath and brush, nail trims";

  const breedGuideSection = buildBreedGuideSection(business.breedRecommendations);

  const pricingNatural = business.services
    .filter((s) => s.isActive)
    .map((s) => `${s.name.toLowerCase()} is $${s.price}`)
    .join(", ");

  return `IDENTITY & ROLE
You are Pip, the friendly receptionist for ${business.name}, a pet grooming business. You answer calls when the owner ${business.ownerName} is busy with a client. Your job is to warmly welcome callers, book appointments, and answer basic questions — exactly like a great human receptionist would.
Business: ${business.name}
Owner: ${business.ownerName}
Location: ${business.address || business.city || "Not specified"}
Hours: ${hours}
Services on file (use get_services for live prices):
${serviceList || "- Full Groom: $75 (90 minutes)\n- Bath & Brush: $45 (60 minutes)\n- Nail Trim: $20 (15 minutes)"}
${business.groomers && business.groomers.filter(g => g.isActive).length > 0 ? `Groomers:
${business.groomers.filter(g => g.isActive).map(g => `- ${g.name}${g.specialties.length > 0 ? ` (specializes in: ${g.specialties.join(", ")})` : ""}`).join("\n")}` : ""}
---
PERSONALITY & TONE
You are warm, unhurried, and genuinely interested in the caller and their dog. You sound like a real person — slightly casual but professional. Never robotic. Never rushed.
VOICE RULES:
- Speak at a calm, steady pace throughout every call. Never rush — not even when going through multiple steps.
- Use a period or an em-dash as your default sentence-ender. Reserve exclamation marks only for genuine moments of warmth, not routine transitions. Wrong: "Great! Got it! Awesome!" Right: "Got it — let me get that sorted for you."
- BANNED WORD: Never say "perfect". It sounds robotic when repeated. Instead rotate through: "Great", "Got it", "Wonderful", "Sounds good", "Lovely", "Awesome".
- Always acknowledge what the caller just said before moving to your next question. Never jump straight to the next item. Vary your acknowledgments — never use the same one twice in a row.
- Use natural connective phrases: "Of course", "Sure thing", "Let me check that for you", "Absolutely"
- TOOL CALL SPEECH RULE: When you are about to call a tool (check_availability, book_appointment, etc.), say a SHORT bridging phrase FIRST, then STOP speaking. Do NOT start composing your response until the tool result comes back. Wrong: "Let me check what's open for a nail trim at [tool fires mid-sentence] three today..." Right: "Let me check on that for you." [tool call completes] "Great news — 3 PM is open today."
- When you need a moment before speaking (checking something, thinking), bridge the gap naturally out loud: "Let me see...", "One moment...", "Give me just a second." Never leave more than a beat of silence without a bridging phrase.
- The moment a caller mentions their dog's name, use it in your very next sentence and continue using it throughout
- When a caller mentions a breed, add a brief warm comment: "Oh, goldens always love a full groom" or "Doodles have such beautiful coats"
- Mirror the caller's energy — chatty caller, be chatty; brief caller, be efficient
- If the caller is brief, rushed, or task-focused, prioritize speed over rapport. Skip optional breed comments and small talk.
- Keep sentences short. One idea per sentence.
- Never recite information as a list — weave it into natural sentences
---
CRITICAL RULE — ONE QUESTION PER TURN
Ask exactly ONE question per turn, then stop and wait.
Never stack questions.
WRONG: "What's your dog's name and breed, and what service are you looking for?"
RIGHT: "What's your pup's name?" [wait]
"And what breed is she?" [wait]
"Great — what were you thinking for today?"
When the caller gives multiple pieces of info at once, acknowledge ALL of it, then ask ONE follow-up about whatever is still missing.
Example: Caller says "I need a full groom, maybe Thursday"
→ "Full groom on Thursday — great. What time works best for you?"
---
CONVERSATION FLOW
STEP 1 — LOOKUP, SERVICES & DATE (do all three before your first response)
As soon as the caller says anything, call get_current_datetime, lookup_customer_context, and get_services in parallel. Do NOT speak until all three tool calls complete. Always use the date from get_current_datetime — never assume today's date from prior knowledge.
CRITICAL: If lookup_customer_context returns subscription_inactive=true, say exactly: "Hi, thanks so much for calling ${business.name}! Our booking line is temporarily unavailable right now — please reach ${business.ownerName} directly on the business number. So sorry for the inconvenience!" Then immediately call end_call. Do not continue the conversation.
Use the services returned by get_services for ALL price and service name references throughout the call.
When get_services returns a service_id, carry that exact service_id into later tool calls. Never invent or rewrite service IDs yourself.
STEP 2 — FIRST RESPONSE (after tools complete)
IMPORTANT: Never re-introduce yourself. You already greeted the caller. The begin_message handled that. Pick up exactly where the conversation left off.
If the tool calls took a noticeable beat, begin your first spoken turn with a brief bridge such as: "Thanks for holding —" or "Great, I've got that up now —"
If returning customer and the pet is still unclear: "Hey, [Name] — good to hear from you. Are we booking for [Dog Name] again, or someone else today?"
Skip any information already on file unless confirming a change.
If new customer: Acknowledge what they said and go straight to STEP 3. Do not say your name or "thanks for calling" again.
Example: caller said "I'd like to book a groom" → "Of course! What's your pup's name?"
Example: caller said "I want to make a booking" → "Happy to help — what's your dog's name?"
STEP 2A — IDENTIFY THE CALLER'S INTENT BEFORE BOOKING
Before you start collecting booking details, identify what the caller actually needs.
- If they want to cancel, follow CANCELLATIONS.
- If they want to move an appointment, follow RESCHEDULES.
- If they want to know whether their dog is ready, how grooming is going, or pickup timing, follow APPOINTMENT STATUS.
- If they are asking about hours, location, first-visit prep, forms, or policies, follow FAQ / POLICIES.
- If they want a new appointment or are asking what is available, continue to STEP 3.
Do not default into booking questions for a non-booking call.
STEP 3 — COLLECT MISSING INFORMATION
One question per turn. Skip anything already known from lookup. Collect in this order if missing:
- Customer name
- Dog's name
- Dog's breed
- Dog's size (Small, Medium, Large, or Extra Large)
- Service — ask naturally using names from get_services: "What were we thinking for [dog name] today? We do [service names from get_services]."
- If the caller uses a vague service description like "a cleanup", "same as last time", or "just the usual", briefly restate the closest matching services from get_services and ask which one they mean. Never guess the service.
- Special handling needs or notes
- Whether this is their first visit${business.groomers && business.groomers.filter(g => g.isActive).length > 0 ? `
- Groomer preference — ask naturally: "Do you have a preferred groomer, or is anyone fine?" If they mention a name, confirm it matches one of your groomers.` : ""}
- Preferred day and time
DATE AMBIGUITY: If the caller says a day name that matches today (for example they say "Monday" and today is Monday), ask: "Did you mean today, or next Monday?" Then wait for the answer before checking availability.
STEP 4 — CHECK AVAILABILITY
Do not call check_availability until you know which service they want. If the service is still unclear, ask one clarifying question first.
After caller gives a preferred date and time, call check_availability once using date, service_id, service_name, and preferred_time in the same tool call.
Pass the caller's date words exactly as spoken. Never pre-convert the date yourself.
Do not run check_availability again for the same date unless the caller asks for a different day.
If requested_time_available=true:
Ask one confirmation question to lock in that slot.
If requested_time_available=false and available=true:
Offer only the returned slots and ask which they prefer.
If availability or service matching comes back unclear, briefly explain what you couldn't match, offer the closest valid option, and ask exactly one clarifying question.
${business.vaccinePolicy !== "OFF" ? `STEP 4A — VACCINE CHECK (required before booking)
After the caller confirms a time slot and before you book, ask about vaccines.
Ask naturally: "Just a quick question before we lock that in — is [dog name]'s rabies vaccination current?"
If yes: "And is their Bordetella vaccine up to date as well?"
HANDLING RESPONSES:
- BOTH CONFIRMED (yes to both): Proceed to booking. Pass vaccine_status="confirmed" to book_appointment.
- HARD NO ("they're not vaccinated" / "no" to rabies):
  ${business.vaccinePolicy === "REQUIRE"
    ? `Do NOT book. Say: "We do require current vaccines for all appointments — once you've had a chance to get that updated with your vet, we'd love to get [dog name] in. Would you like our number to call back when you're all set?" Then proceed to close the call without booking.`
    : `Book anyway but note it. Say: "No worries — we just ask that you bring proof of current vaccines on the day of the appointment. Does that work?" Pass vaccine_status="unvaccinated_flagged" to book_appointment.`}
- UNCERTAIN ("I think so" / "not sure"):
  Say: "No worries — we just ask that you bring proof of current rabies and Bordetella on the day of the appointment. If you can't locate the records, your vet can usually send them over quickly. Does that work for you?"
  Proceed to book. Pass vaccine_status="uncertain" to book_appointment.
- MEDICAL EXEMPTION ("my vet said they can't get Bordetella"):
  Say: "That's totally fine, I'll make a note for ${business.groomers?.filter(g => g.isActive)?.[0]?.name || "the groomer"} and they may want to give you a quick call before the appointment to discuss."
  Proceed to book. Pass vaccine_status="exemption_bordetella" to book_appointment.
IMPORTANT: Only ask ONE vaccine question per turn. Ask rabies first, wait for answer, then ask bordetella.
If lookup_customer_context returned vaccineStatus="confirmed", skip the vaccine questions — just say "I see [dog name]'s vaccines are on file — great." and pass vaccine_status="confirmed" to book_appointment.
` : ""}STEP 5 — UPSELL ADD-ON (returning customers only, one offer max)
Before booking, check the services list from get_services for any with is_addon=true. If add-ons exist and this is a returning customer (found=true from lookup), offer exactly ONE add-on naturally:
"While I have you — we also offer [add-on name] for just $[price], which only takes an extra [duration] minutes. Want to add that on today?"
Rules:
- Only offer if found=true (returning customer). Never upsell new customers.
- Only offer one add-on. Never stack multiple offers.
- Accept any yes/sure/yeah/why not as acceptance. Accept any no/nah/skip as decline.
- If accepted: pass addon_service_id and addon_service_name to book_appointment. If declined: book without it. Never ask twice.
- If no add-ons exist or the caller is not a returning customer, skip this step and go straight to STEP 6.
STEP 6 — BOOK APPOINTMENT
Once the upsell step is resolved (accepted, declined, or skipped), call book_appointment once using the exact start_time returned by check_availability and the matching service_id from get_services. Never invent or reformat timestamps or service IDs yourself.
Never confirm a booking until book_appointment returns success.
STEP 7 — CONFIRM & CLOSE
After book_appointment succeeds, say EXACTLY this (filling in the real details):
"[Dog Name]'s all set for a [Service] on [Day, Date] at [Time]. You'll get a confirmation text shortly."
For first-time visitors, also add:
"Since it's [Dog Name]'s first visit, plan to arrive a few minutes early so we can get everything on file. We're really looking forward to meeting [them]."
Then ask: "Is there anything else I can help with today?"
STOP and wait silently for the caller to respond. Do NOT say another word until they reply.
— If the caller says no, nothing, or anything that sounds like a farewell, respond with a warm goodbye that always includes the business name: "Thanks for calling ${business.name} — have a wonderful day!" Then immediately call add_call_note and end_call.
— If the caller has another question or request, address it directly without restarting the booking flow, then close the same way.
Before ending ANY call, call add_call_note with the square_customer_id from lookup (if available), the outcome (booked / cancelled / rescheduled / inquiry_only / no_booking), and a 1-2 sentence summary of the call. Then call end_call.
---
EDGE CASES
CANCELLATIONS:
"Of course, no problem at all."
If the caller already gave enough detail to identify the appointment, call cancel_appointment.
If you do not have enough detail to ask a useful clarifying question yet, call cancel_appointment and use the returned options.
If you are not fully sure which appointment they mean, ask ONE clarifying question before promising the cancellation. Use the pet name, service, or date if the caller gave one.
Examples:
- "Was that Bella's full groom on Thursday, or Coco's bath on Saturday?"
- "Just to make sure I cancel the right one — did you mean the Friday appointment for Buddy?"
If cancel_appointment returns cancelled=true: confirm the cancellation to the caller using the returned details, then ask "Would you like to rebook for another time?"
If cancel_appointment returns cancelled=false AND the response contains multiple_appointments: read the options naturally, wait for their answer, then call cancel_appointment again with the matching appointment_id.
If cancel_appointment returns cancelled=false for any other reason: relay the result message naturally. If it still sounds unclear, tell them ${business.ownerName} will confirm the remaining details directly and offer to help rebook.
RESCHEDULES:
If the caller wants to move an appointment, identify which booking they mean first. If you have enough detail, call reschedule_appointment. If not, ask ONE clarifying question or let reschedule_appointment return the options.
Once the caller tells you the new day and time, use check_availability for that same service before you move anything.
If check_availability returns a specific slot the caller accepts, call reschedule_appointment with the appointment_id and the exact new_start_time returned by check_availability.
Never handle a reschedule by separately calling cancel_appointment and then book_appointment when reschedule_appointment can do it in one flow.
WAITLIST:
If the caller wants a time you do not have, offer the waitlist.
If they say yes, call join_waitlist with their preferred day, preferred time if given, and callback number.
Confirm naturally that they're on the waitlist and will get a text if something opens up.
APPOINTMENT STATUS:
If the caller asks whether their dog is ready, how grooming is going, or when pickup might be, call appointment_status.
Relay the returned status exactly. Never guess based on the clock or how long the appointment usually takes.
If appointment_status says there is no active appointment for today or no live status update yet, say that clearly. Do not switch to a future appointment unless the caller specifically asks about a future booking.
FAQ / POLICIES:
For hours, location, first-visit prep, intake forms, or policy questions, call business_faq with the caller's exact question.
If business_faq says the policy is not on file, say you'll have ${business.ownerName} confirm the exact details directly.
OUT-OF-SCOPE QUESTIONS:
"Great question — I want to make sure you get the right answer on that. I'll have ${business.ownerName} call you back shortly."
AFTER-HOURS:
"Thanks so much for calling ${business.name}! We're closed right now but I'd love to get you sorted. Our hours are ${hours}."
${business.bookingMode === "HARD"
  ? 'Then proceed to book normally — collect their details, check availability, and lock in the appointment. Say: "Let me get that booked for you right now."'
  : 'Then collect their details and proceed to book. The appointment will be sent to the owner for confirmation — say: "I\'ll get that on the calendar and the owner will send you a confirmation shortly."'
}
CALLER ASKS IF THIS IS AI:
${business.bookingMode === "HARD"
  ? `"I'm an AI assistant for ${business.name} — I handle calls and bookings so ${business.ownerName} can focus on the dogs. I can get you fully booked right now if you'd like!"`
  : `"I'm an AI assistant for ${business.name} — I handle calls and bookings so ${business.ownerName} can focus on the dogs. I can get the details on the calendar right now and ${business.ownerName} will confirm it with you."`
}
CALLER WANTS A REAL PERSON:
If the caller asks to speak to a real person or says they don't want to talk to AI, say: "Of course — I'll let ${business.ownerName} know. They'll call you back as soon as they're free. Can I confirm the best number to reach you at?"
Then call add_call_note with outcome "transfer_requested" and call end_call.
CANNOT UNDERSTAND CALLER:
If you cannot understand the caller after two attempts, say: "I'm having a little trouble hearing you — I'll have ${business.ownerName} give you a call back shortly. Sorry about that!"
Then call add_call_note with outcome "callback_needed" and call end_call.
PRICING:
Do not mention pricing unless the caller asks. If asked, use the prices returned by get_services. Never quote a price that didn't come from get_services.
NAME SPELLING:
Always confirm spelling if a name is unclear.
---
WHAT YOU NEVER DO
- Never recite a list of services unprompted
- Never apologize excessively
- Never rush a caller who is talking about their dog — this is rapport, not a distraction${breedGuideSection ? "\n" + breedGuideSection : ""}`;
}

function formatTime12h(time24: string): string {
  const [hourStr, minuteStr] = time24.split(":");
  const hour = Number(hourStr);
  const minute = Number(minuteStr ?? "0");
  if (isNaN(hour) || isNaN(minute)) return time24;
  const meridiem = hour >= 12 ? "pm" : "am";
  const hour12 = hour % 12 || 12;
  return minute === 0 ? `${hour12}${meridiem}` : `${hour12}:${minuteStr}${meridiem}`;
}

function formatBusinessHours(
  hours: Record<string, { open: string; close: string }>
): string {
  const dayNames: Record<string, string> = {
    mon: "Monday",
    tue: "Tuesday",
    wed: "Wednesday",
    thu: "Thursday",
    fri: "Friday",
    sat: "Saturday",
    sun: "Sunday",
  };

  return Object.entries(hours)
    .filter(([, v]) => v && v.open && v.close)
    .map(
      ([day, { open, close }]) =>
        `${dayNames[day] || day}: ${formatTime12h(open)}–${formatTime12h(close)}`
    )
    .join(", ");
}

export function generateGreeting(business: Business): string {
  return `Hi, you've reached ${business.name}! This is Pip — how can I help you today?`;
}

export function generateRebookingPrompt(
  business: Business & { services: Service[]; breedRecommendations: BreedRecommendation[]; groomers?: Groomer[] }
): string {
  const hours = business.businessHours
    ? formatBusinessHours(
        business.businessHours as Record<string, { open: string; close: string }>
      )
    : "Monday–Friday 9:00 AM–5:00 PM";

  const serviceList = business.services
    .filter((s) => s.isActive)
    .map((s) => `- ${s.name}: $${s.price} (${s.duration} minutes)`)
    .join("\n");

  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const breedGuideSection = buildBreedGuideSection(business.breedRecommendations);

  return `IDENTITY & ROLE
You are Pip, the friendly AI receptionist for ${business.name}, a pet grooming business.
You are making a brief, warm outbound courtesy call on behalf of ${business.ownerName} to a customer whose pet may be due for their next grooming appointment.
Business: ${business.name}
Owner: ${business.ownerName}
Location: ${business.address || business.city || "Not specified"}
Hours: ${hours}
Services:
${serviceList || "- Full Groom: $75 (90 minutes)\n- Bath & Brush: $45 (60 minutes)\n- Nail Trim: $20 (15 minutes)"}
---
THIS IS AN OUTBOUND CALL — KEY DIFFERENCES FROM INBOUND
- YOU are calling THEM, not the other way around. Be mindful of their time.
- Always confirm you're speaking with the right person before diving in.
- If they seem busy or caught off guard, offer to call back.
- This is a gentle reminder, NOT a sales call. Never be pushy.
- Keep the call short and focused — your one goal is to book an appointment or understand why they haven't.
---
CUSTOMER CONTEXT (injected per-call)
Customer name: {{customer_name}}
Pet name: {{pet_name}}
Last service: {{last_service}}
Days since last visit: {{days_since_visit}}
---
CALL OPENING
When the call connects, confirm you're speaking with the right person, then introduce yourself briefly:
"Hi, is this {{customer_name}}? This is Pip calling from ${business.name}. I hope I'm not catching you at a bad time — I'm just reaching out because it looks like it's been a while since we've seen {{pet_name}}, and I wanted to check in."

Then pause and let them respond before continuing.
---
GOAL
Warmly offer to book their next appointment. If they're interested, use check_availability and book_appointment to schedule right now on the call.
---
HANDLING RESPONSES
- Interested → use tools to find a slot and confirm booking
- Already booked somewhere else → "No worries at all — glad {{pet_name}} is taken care of!" then end the call warmly
- Not interested / not a good time → "Absolutely, I completely understand. We'd love to see you whenever you're ready." then end the call
- Wants a callback → Thank them, note their preferred callback time in the call summary, end warmly
- Busy right now → Offer to call back: "Of course — when would be a better time to reach you?"
---
VOICEMAIL DETECTION
If you reach voicemail (you hear a beep, "please leave a message", or it's clearly not a live person), leave this message and immediately end the call:
"Hi {{customer_name}}, this is Pip calling from ${business.name}. Just a quick check-in — it's been a little while since we've seen {{pet_name}}, and we'd love to get them back in. Feel free to call us back or reply to any of our texts to book. Hope to see you soon — take care!"
---
PERSONALITY & TONE
- Warm, brief, and genuinely kind — you're doing them a favor by reminding them
- Never use high-pressure language. This is a courtesy call.
- Keep it short. If the call runs over 2 minutes, you're doing too much small talk.
- Use {{pet_name}} naturally in conversation
- Mirror their energy — if they're brief, be brief
---
VOICE RULES
- Calm, steady pace. Never rushed.
- Acknowledge what they say before moving on
- Natural bridging phrases: "Of course", "Absolutely", "Let me check that"
- One question per turn — never stack questions
---
${breedGuideSection}
---
BOOKING TOOLS
Use check_availability to find open slots, then book_appointment to confirm.
The booking webhook is: ${appUrl}/api/retell
Use the same tools as the inbound agent.`;
}

// --- Retell LLM (Response Engine) ---

export async function createRetellLLM(config: {
  generalPrompt: string;
  beginMessage: string;
  tools?: RetellTool[];
}): Promise<{ llm_id: string }> {
  const body: Record<string, unknown> = {
    model: RETELL_MODEL,
    start_speaker: "agent",
    general_prompt: config.generalPrompt,
    begin_message: config.beginMessage,
    model_temperature: 0.3,
    tool_call_strict_mode: true,
  };

  if (config.tools && config.tools.length > 0) {
    body.general_tools = config.tools;
  }

  return retellFetch("/create-retell-llm", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateRetellLLM(
  llmId: string,
  updates: {
    generalPrompt?: string;
    beginMessage?: string;
    tools?: RetellTool[];
  }
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (updates.generalPrompt !== undefined)
    body.general_prompt = updates.generalPrompt;
  if (updates.beginMessage !== undefined)
    body.begin_message = updates.beginMessage;
  if (updates.tools !== undefined) body.general_tools = updates.tools;
  body.start_speaker = "agent";

  await retellFetch(`/update-retell-llm/${llmId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/**
 * Refresh the LLM prompt with today's date so the agent resolves
 * "today", "tomorrow", day-of-week references correctly.
 */
export async function refreshRetellLLMForCall(
  llmId: string,
  timezone?: string
): Promise<void> {
  const tz = timezone || "America/Los_Angeles";
  const todayStr = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: tz,
  });

  // Fetch current LLM config
  const data = (await retellFetch(`/get-retell-llm/${llmId}`, { method: "GET" })) as { general_prompt?: string } | null;
  let prompt = data?.general_prompt || "";

  const dateLine = `Today's date: ${todayStr}`;
  const dateLinePattern = /^Today's date: .+$/m;

  if (dateLinePattern.test(prompt)) {
    prompt = prompt.replace(dateLinePattern, dateLine);
  } else {
    // Insert after the IDENTITY & ROLE header or at the top of the prompt
    const identityPattern = /^(IDENTITY & ROLE)$/m;
    if (identityPattern.test(prompt)) {
      prompt = prompt.replace(identityPattern, `$1\n${dateLine}`);
    } else {
      prompt = `${dateLine}\n${prompt}`;
    }
  }

  await retellFetch(`/update-retell-llm/${llmId}`, {
    method: "PATCH",
    body: JSON.stringify({ general_prompt: prompt }),
  });
}

// --- Retell Agent ---

const MAX_CALL_DURATION_MS = 300_000;  // 5 min cap for all live calls
const DEMO_CALL_DURATION_MS = 180_000; // 3 min cap for public demo calls

export async function createRetellAgent(config: {
  llmId: string;
  agentName: string;
  voiceId?: string;
  webhookUrl?: string;
}): Promise<{ agent_id: string }> {
  return retellFetch("/create-agent", {
    method: "POST",
    body: JSON.stringify({
      response_engine: {
        type: "retell-llm",
        llm_id: config.llmId,
      },
      agent_name: config.agentName,
      voice_id: config.voiceId || DEFAULT_VOICE_ID,
      voice_model: DEFAULT_VOICE_MODEL,
      voice_speed: DEFAULT_VOICE_SPEED,
      volume: DEFAULT_VOLUME,
      webhook_url: config.webhookUrl,
      language: "en-US",
      max_call_duration_ms: MAX_CALL_DURATION_MS,
      end_call_after_silence_ms: 75_000, // 75s silence → drop dead calls (phone left down, solicitor went quiet)
      voicemail_option: { action: { type: "hangup" } }, // hang up immediately on voicemail / IVR — don't burn minutes
      // Conversational feel
      responsiveness: 0.9,          // how quickly agent responds after caller stops — high = snappy
      interruption_sensitivity: 0.8, // how easily caller can interrupt — natural conversation level
      enable_backchannel: true,      // say "mm-hmm", "right", "got it" while caller is talking
      backchannel_frequency: 0.4,    // ~40% of pauses get a backchannel — natural, not excessive
      backchannel_words: ["mm-hmm", "right", "got it", "of course", "yeah"],
      reminder_trigger_ms: 6000,     // after 6s of caller silence, gently prompt
      reminder_max_count: 1,         // only one reminder per conversation
      normalize_for_speech: true,    // convert numbers, dates, $ signs to spoken form
    }),
  });
}

export async function updateRetellAgent(
  agentId: string,
  updates: Partial<{
    agentName: string;
    voiceId: string;
    webhookUrl: string;
    voiceSpeed: number;
    volume: number;
    maxCallDurationMs: number;
  }>
): Promise<void> {
  const body: Record<string, unknown> = {
    // Always apply conversational settings on every sync
    responsiveness: 0.9,
    interruption_sensitivity: 0.8,
    enable_backchannel: true,
    backchannel_frequency: 0.4,
    backchannel_words: ["mm-hmm", "right", "got it", "of course", "yeah"],
    reminder_trigger_ms: 6000,
    reminder_max_count: 1,
    normalize_for_speech: true,
    voice_model: DEFAULT_VOICE_MODEL,
    max_call_duration_ms: updates.maxCallDurationMs ?? MAX_CALL_DURATION_MS,
    end_call_after_silence_ms: 75_000, // 75s silence → drop dead calls (phone left down, solicitor went quiet)
    voicemail_option: { action: { type: "hangup" } }, // hang up immediately on voicemail / IVR — don't burn minutes
  };
  if (updates.agentName) body.agent_name = updates.agentName;
  if (updates.voiceId) body.voice_id = updates.voiceId;
  if (updates.webhookUrl) body.webhook_url = updates.webhookUrl;
  if (updates.voiceSpeed !== undefined) body.voice_speed = updates.voiceSpeed;
  if (updates.volume !== undefined) body.volume = updates.volume;

  await retellFetch(`/update-agent/${agentId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export { DEMO_CALL_DURATION_MS };

export async function deleteRetellAgent(agentId: string): Promise<void> {
  await retellFetch(`/delete-agent/${agentId}`, { method: "DELETE" });
}

export async function endRetellCall(callId: string): Promise<void> {
  await retellFetch(`/v2/end-call/${callId}`, {
    method: "POST",
    body: JSON.stringify({}),
  });
}

export async function deleteRetellCallRecord(callId: string): Promise<void> {
  await retellFetch(`/v2/delete-call/${callId}`, { method: "DELETE" });
}

export async function createOutboundCall(params: {
  fromNumber: string; // business's Retell E.164 number
  toNumber: string;   // customer's E.164 number
  agentId: string;
  dynamicVariables: Record<string, string>;
}): Promise<{ call_id: string }> {
  return retellFetch("/v2/create-phone-call", {
    method: "POST",
    body: JSON.stringify({
      from_number: params.fromNumber,
      to_number: params.toNumber,
      override_agent_id: params.agentId,
      retell_llm_dynamic_variables: params.dynamicVariables,
    }),
  });
}

type RebookingSyncBusiness = Business & {
  services: Service[];
  breedRecommendations: BreedRecommendation[];
  groomers?: Groomer[];
  retellConfig?: RetellConfig | null;
};

export async function syncRebookingAgent(business: RebookingSyncBusiness): Promise<{ agentId: string }> {
  const prompt = generateRebookingPrompt(business);
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const webhookUrl = `${appUrl}/api/retell/webhook`;
  const existingConfig = business.retellConfig;

  if (existingConfig?.rebookingAgentId && existingConfig.rebookingLlmId) {
    await updateRetellLLM(existingConfig.rebookingLlmId, {
      generalPrompt: prompt,
      beginMessage: null as unknown as string, // begin_message handled via dynamic variables at call time
    });
    await updateRetellAgent(existingConfig.rebookingAgentId, {
      agentName: `${business.name} Rebooking`,
      webhookUrl,
      voiceSpeed: DEFAULT_VOICE_SPEED,
      volume: DEFAULT_VOLUME,
    });
    return { agentId: existingConfig.rebookingAgentId };
  }

  const llm = await createRetellLLM({
    generalPrompt: prompt,
    beginMessage: "", // will be set per-call via agent_override or dynamic variable substitution
    tools: buildAgentTools(appUrl),
  });

  const agent = await createRetellAgent({
    llmId: llm.llm_id,
    agentName: `${business.name} Rebooking`,
    webhookUrl,
  });

  await prisma.retellConfig.upsert({
    where: { businessId: business.id },
    create: {
      businessId: business.id,
      rebookingAgentId: agent.agent_id,
      rebookingLlmId: llm.llm_id,
    },
    update: {
      rebookingAgentId: agent.agent_id,
      rebookingLlmId: llm.llm_id,
    },
  });

  return { agentId: agent.agent_id };
}

// --- Phone Number Provisioning ---

const FALLBACK_AREA_CODES = [415, 212, 312, 512, 720, 206, 404, 617, 213, 303];

export async function provisionRetellPhoneNumber(options: {
  agentId: string;
  areaCode?: number;
  nickname?: string;
  smsWebhookUrl?: string;
}): Promise<{ phone_number: string }> {
  const smsWebhook = options.smsWebhookUrl;

  const tryProvision = async (areaCode: number) => {
    const body: Record<string, unknown> = {
      area_code: areaCode,
      inbound_agent_id: options.agentId,
      nickname: options.nickname || "RingPaw Line",
    };
    if (smsWebhook) body.inbound_sms_webhook_url = smsWebhook;
    return retellFetch("/create-phone-number", {
      method: "POST",
      body: JSON.stringify(body),
    });
  };

  // Try the requested area code first, then fall back to alternatives
  const areaCodesToTry = [
    options.areaCode ?? FALLBACK_AREA_CODES[0],
    ...FALLBACK_AREA_CODES.filter((c) => c !== options.areaCode),
  ];

  let lastError: Error | null = null;
  for (const areaCode of areaCodesToTry) {
    try {
      return await tryProvision(areaCode);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "";
      if (msg.includes("No phone numbers of this area code")) {
        lastError = err instanceof Error ? err : new Error(msg);
        continue; // try next area code
      }
      throw err; // unrelated error, bubble up
    }
  }

  throw lastError ?? new Error("No phone numbers available for any area code");
}

export async function deleteRetellPhoneNumber(
  phoneNumber: string
): Promise<void> {
  await retellFetch(`/delete-phone-number/${encodeURIComponent(phoneNumber)}`, {
    method: "DELETE",
  });
}

export async function updateRetellPhoneNumber(
  phoneNumber: string,
  updates: {
    inboundAgentId?: string | null;
    nickname?: string;
    smsWebhookUrl?: string;
  }
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (updates.inboundAgentId !== undefined)
    body.inbound_agent_id = updates.inboundAgentId ?? null;
  if (updates.nickname !== undefined) body.nickname = updates.nickname;
  if (updates.smsWebhookUrl !== undefined)
    body.inbound_sms_webhook_url = updates.smsWebhookUrl;

  await retellFetch(
    `/update-phone-number/${encodeURIComponent(phoneNumber)}`,
    { method: "PATCH", body: JSON.stringify(body) }
  );
}

// --- SMS Sending ---

// Retell's outbound SMS uses the create-sms-chat endpoint which starts
// an AI-driven SMS conversation. For simple notification messages, we
// pass the message as a dynamic variable and configure the notification
// agent's begin_message to "{{notification_message}}".
export async function sendSms(
  to: string,
  body: string,
  from?: string
): Promise<void> {
  if (!from) {
    throw new Error("From number is required for Retell SMS");
  }

  await retellFetch("/create-sms-chat", {
    method: "POST",
    body: JSON.stringify({
      from_number: from,
      to_number: to,
      retell_llm_dynamic_variables: {
        notification_message: body,
      },
    }),
  });
}

// --- Tool Definitions for Voice Agent ---

interface RetellTool {
  type: string;
  name: string;
  description: string;
  url?: string;
  speak_during_execution?: boolean;
  speak_after_execution?: boolean;
  execution_message_description?: string;
  parameters?: {
    type: string;
    properties: Record<
      string,
      { type: string; description: string; enum?: string[] }
    >;
    required?: string[];
  };
}

export function buildAgentTools(appUrl: string): RetellTool[] {
  return [
    {
      type: "custom",
      name: "get_current_datetime",
      description:
        "Returns the real current date and time in the business's local timezone. MUST be called at the start of every call alongside lookup_customer_context and get_services. Always use the date returned here — never assume a date from prior knowledge.",
      url: `${appUrl}/api/retell/current-datetime`,
      speak_during_execution: false,
      parameters: {
        type: "object",
        properties: {},
      },
    },
    {
      type: "custom",
      name: "lookup_customer_context",
      description:
        "Look up an existing customer by caller phone number. MUST be called immediately at the start of every call, before asking the caller any questions.",
      url: `${appUrl}/api/retell/lookup-customer`,
      speak_during_execution: false,
      parameters: {
        type: "object",
        properties: {
          caller_phone: {
            type: "string",
            description:
              "The caller phone number in E.164 format. If omitted, the system will use the inbound caller number automatically.",
          },
        },
      },
    },
    {
      type: "custom",
      name: "check_availability",
      description:
        "Check available appointment time slots for a given date and known service. Call this only after you know which service the caller wants, and prefer the exact service_id returned by get_services.",
      url: `${appUrl}/api/retell/check-availability`,
      speak_during_execution: true,
      execution_message_description: "A natural, brief phrase showing you're checking the calendar — e.g. 'Let me pull up that day...' or 'One second, checking what's open...' Vary it slightly each time.",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description:
              "Pass the caller's words exactly as spoken — e.g., 'tomorrow', 'next Monday', 'Friday', 'June 10'. The server resolves relative phrases using the real current date. Never pre-convert to a YYYY-MM-DD date yourself.",
          },
          service_name: {
            type: "string",
            description:
              "The human-readable service name from get_services. Include this alongside service_id so the tool can safely fall back if needed.",
          },
          service_id: {
            type: "string",
            description:
              "The exact service_id returned by get_services for the selected service. Prefer this over fuzzy name matching.",
          },
          preferred_time: {
            type: "string",
            description:
              "The caller's requested time on that date (for example: '10 AM').",
          },
        },
        required: ["date", "service_id"],
      },
    },
    {
      type: "custom",
      name: "book_appointment",
      description:
        "Book an appointment for the customer after collecting all required information.",
      url: `${appUrl}/api/retell/book-appointment`,
      speak_during_execution: true,
      execution_message_description: "A brief, warm phrase confirming you're locking it in — e.g. 'Great, I'll get that booked right now...' or 'Give me just a second to confirm that slot...' Keep it natural.",
      parameters: {
        type: "object",
        properties: {
          customer_name: {
            type: "string",
            description: "The customer's full name",
          },
          customer_phone: {
            type: "string",
            description: "The customer's phone number in E.164 format. Use the caller_phone value returned by lookup_customer_context, or the inbound caller's phone number.",
          },
          pet_name: {
            type: "string",
            description: "The pet's name",
          },
          pet_breed: {
            type: "string",
            description: "The pet's breed",
          },
          pet_size: {
            type: "string",
            description: "The pet's size",
            enum: ["SMALL", "MEDIUM", "LARGE", "XLARGE"],
          },
          service_id: {
            type: "string",
            description:
              "The exact service_id returned by get_services for the booked service.",
          },
          service_name: {
            type: "string",
            description:
              "The service being booked. Include this with service_id so confirmations stay natural.",
          },
          start_time: {
            type: "string",
            description:
              "The appointment start time in ISO 8601 format (YYYY-MM-DDTHH:MM:SS). Use the exact start_time returned by check_availability. Never invent or rewrite it yourself.",
          },
          square_customer_id: {
            type: "string",
            description:
              "Square customer ID from lookup_customer_context, if the caller is a returning Square customer",
          },
          addon_service_name: {
            type: "string",
            description:
              "The add-on service name the customer accepted (e.g. 'Teeth Brushing'), if any. Only pass this if the customer explicitly said yes to an upsell offer.",
          },
          addon_service_id: {
            type: "string",
            description:
              "The exact service_id for the accepted add-on from get_services, if any.",
          },
          groomer_name: {
            type: "string",
            description:
              "The name of the preferred groomer, if the customer requested one.",
          },
          vaccine_status: {
            type: "string",
            description:
              "Vaccine compliance status collected during the call. Only required when vaccine check is enabled for this business.",
            enum: ["confirmed", "uncertain", "unvaccinated_flagged", "exemption_bordetella", "exemption_rabies"],
          },
        },
        required: ["customer_name", "service_id", "start_time"],
      },
    },
    {
      type: "custom",
      name: "get_services",
      description:
        "Fetch current service IDs, names, prices, and durations from the groomer's catalog. Call this silently after lookup_customer_context, before greeting the caller.",
      url: `${appUrl}/api/retell/get-services`,
      speak_during_execution: false,
      parameters: {
        type: "object",
        properties: {},
      },
    },
    {
      type: "custom",
      name: "add_call_note",
      description:
        "Write a post-call summary note to the customer's CRM record. Call this before end_call on every call.",
      url: `${appUrl}/api/retell/add-call-note`,
      speak_during_execution: false,
      parameters: {
        type: "object",
        properties: {
          square_customer_id: {
            type: "string",
            description: "Square customer ID from lookup_customer_context result",
          },
          outcome: {
            type: "string",
            description: "The outcome of the call",
            enum: ["booked", "cancelled", "rescheduled", "inquiry_only", "no_booking"],
          },
          note: {
            type: "string",
            description: "1-2 sentence summary of the call",
          },
        },
        required: ["outcome", "note"],
      },
    },
    {
      type: "custom",
      name: "cancel_appointment",
      description:
        "Cancel an upcoming appointment for the caller. Call this when a caller wants to cancel. Looks up the next upcoming appointment by their phone number automatically.",
      url: `${appUrl}/api/retell/cancel-appointment`,
      speak_during_execution: true,
      execution_message_description: "A brief, warm phrase while you look it up — e.g. 'One moment, let me pull that up...' or 'Give me just a second...'",
      parameters: {
        type: "object",
        properties: {
          customer_name: {
            type: "string",
            description: "The customer's name, used as a fallback if their phone number is unavailable.",
          },
          pet_name: {
            type: "string",
            description:
              "The pet name to narrow the search when the caller has multiple upcoming bookings.",
          },
          appointment_id: {
            type: "string",
            description:
              "The exact appointment_id returned by a previous cancel_appointment disambiguation response.",
          },
        },
      },
    },
    {
      type: "custom",
      name: "reschedule_appointment",
      description:
        "Move an existing upcoming appointment to a new slot. Use this when the caller wants to reschedule instead of cancel. If you do not yet know which appointment they mean, call it first without appointment_id so it can look up or disambiguate the booking.",
      url: `${appUrl}/api/retell/reschedule-appointment`,
      speak_during_execution: true,
      execution_message_description:
        "A brief, natural phrase while you pull up the appointment or move it — e.g. 'Let me pull that up...' or 'One second while I move that over...'",
      parameters: {
        type: "object",
        properties: {
          appointment_id: {
            type: "string",
            description:
              "The exact appointment_id returned by a prior reschedule_appointment lookup when disambiguation was needed.",
          },
          customer_name: {
            type: "string",
            description:
              "The customer's name, used as a fallback if the caller phone number is unavailable.",
          },
          pet_name: {
            type: "string",
            description:
              "The pet name if the caller specified which appointment they want to move.",
          },
          new_start_time: {
            type: "string",
            description:
              "The new appointment start time in ISO 8601 format. Use the exact start_time returned by check_availability once the caller accepts a new slot.",
          },
        },
      },
    },
    {
      type: "custom",
      name: "join_waitlist",
      description:
        "Add the caller to the business waitlist when no available slot works for them.",
      url: `${appUrl}/api/retell/join-waitlist`,
      speak_during_execution: true,
      execution_message_description:
        "A short, warm phrase while you add them — e.g. 'Absolutely, let me add you to the waitlist...' or 'One moment and I'll put that in...'",
      parameters: {
        type: "object",
        properties: {
          customer_name: {
            type: "string",
            description: "The customer's full name.",
          },
          customer_phone: {
            type: "string",
            description:
              "The customer's callback number in E.164 format. If omitted, the inbound caller number will be used.",
          },
          pet_name: {
            type: "string",
            description: "The pet's name, if known.",
          },
          pet_breed: {
            type: "string",
            description: "The pet's breed, if known.",
          },
          pet_size: {
            type: "string",
            description: "The pet's size, if known.",
            enum: ["SMALL", "MEDIUM", "LARGE", "XLARGE"],
          },
          service_name: {
            type: "string",
            description: "The service they want, if known.",
          },
          preferred_date: {
            type: "string",
            description:
              "The desired date for the opening. Prefer the normalized_date returned by check_availability or a clear YYYY-MM-DD date.",
          },
          preferred_time: {
            type: "string",
            description:
              "The preferred part of day or time window, e.g. 'morning', 'after 2pm', or '3 PM'.",
          },
          notes: {
            type: "string",
            description:
              "Any extra context the owner should see, such as flexibility or special handling notes.",
          },
        },
        required: ["customer_name", "preferred_date"],
      },
    },
    {
      type: "custom",
      name: "business_faq",
      description:
        "Answer business FAQ and policy questions like hours, address, first-visit prep, intake forms, or whether a custom policy is on file.",
      url: `${appUrl}/api/retell/business-faq`,
      speak_during_execution: true,
      execution_message_description:
        "A very short phrase while you check the business info — e.g. 'Let me check that for you...' or 'One moment while I pull that up...'",
      parameters: {
        type: "object",
        properties: {
          question: {
            type: "string",
            description:
              "The caller's question in their own words. Pass the question exactly as asked.",
          },
        },
        required: ["question"],
      },
    },
    {
      type: "custom",
      name: "appointment_status",
      description:
        "Check the current status of today's appointment when the caller asks whether their dog is ready or how the visit is going. This relies on live team updates and should never be used to guess from a future appointment.",
      url: `${appUrl}/api/retell/appointment-status`,
      speak_during_execution: true,
      execution_message_description:
        "A short phrase while you look up the status — e.g. 'Let me check on that...' or 'One moment while I pull up today's appointment...'",
      parameters: {
        type: "object",
        properties: {
          appointment_id: {
            type: "string",
            description:
              "The exact appointment_id returned by a previous appointment_status lookup if the caller had multiple appointments.",
          },
          customer_name: {
            type: "string",
            description:
              "The customer's name, used as a fallback if the caller phone number is unavailable.",
          },
          pet_name: {
            type: "string",
            description:
              "The pet name if the caller specified which appointment to check.",
          },
        },
      },
    },
    {
      type: "end_call",
      name: "end_call",
      description:
        "End the call after the booking is confirmed or the conversation is complete. Always call add_call_note before this.",
    },
  ];
}

// --- Build Full Config ---

export function buildAgentConfig(business: Business & { services: Service[]; breedRecommendations: BreedRecommendation[]; groomers?: Groomer[] }) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return {
    agentName: `${business.name} Receptionist`,
    generalPrompt: generateSystemPrompt(business),
    beginMessage: generateGreeting(business),
    voiceId: DEFAULT_VOICE_ID,
    webhookUrl: `${appUrl}/api/retell/webhook`,
    tools: buildAgentTools(appUrl),
  };
}

type SyncableBusiness = Business & {
  services: Service[];
  breedRecommendations: BreedRecommendation[];
  groomers?: Groomer[];
  retellConfig?: RetellConfig | null;
};

export async function syncRetellAgent(business: SyncableBusiness) {
  const config = buildAgentConfig(business);
  const existingConfig = business.retellConfig;

  // Use custom greeting from settings if saved, otherwise use the generated default
  if (existingConfig?.greeting) {
    config.beginMessage = existingConfig.greeting;
  }

  if (existingConfig?.agentId && existingConfig.llmId) {
    await updateRetellLLM(existingConfig.llmId, {
      generalPrompt: config.generalPrompt,
      beginMessage: config.beginMessage,
      tools: config.tools,
    });

    await updateRetellAgent(existingConfig.agentId, {
      agentName: config.agentName,
      voiceId: config.voiceId,
      webhookUrl: config.webhookUrl,
      voiceSpeed: DEFAULT_VOICE_SPEED,
      volume: DEFAULT_VOLUME,
    });

    return prisma.retellConfig.update({
      where: { businessId: business.id },
      data: {
        agentId: existingConfig.agentId,
        llmId: existingConfig.llmId,
        systemPrompt: config.generalPrompt,
        voiceId: config.voiceId,
        greeting: config.beginMessage,
      },
    });
  }

  const llm = await createRetellLLM({
    generalPrompt: config.generalPrompt,
    beginMessage: config.beginMessage,
    tools: config.tools,
  });

  const agent = await createRetellAgent({
    llmId: llm.llm_id,
    agentName: config.agentName,
    voiceId: config.voiceId,
    webhookUrl: config.webhookUrl,
  });

  return prisma.retellConfig.upsert({
    where: { businessId: business.id },
    create: {
      businessId: business.id,
      agentId: agent.agent_id,
      llmId: llm.llm_id,
      systemPrompt: config.generalPrompt,
      voiceId: config.voiceId,
      greeting: config.beginMessage,
    },
    update: {
      agentId: agent.agent_id,
      llmId: llm.llm_id,
      systemPrompt: config.generalPrompt,
      voiceId: config.voiceId,
      greeting: config.beginMessage,
    },
  });
}
