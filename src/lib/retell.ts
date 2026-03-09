import { prisma } from "./prisma";
import type { Business, BreedRecommendation, RetellConfig, Service, Groomer } from "@prisma/client";

const RETELL_BASE_URL = "https://api.retellai.com";
const RETELL_MODEL = process.env.RETELL_MODEL || "claude-4.6-sonnet";
const DEFAULT_VOICE_ID = "11labs-Grace";
const DEFAULT_VOICE_SPEED = 1.0;
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
- Always acknowledge what the caller just said before moving to your next question. Never jump straight to the next item.
- Use natural connective phrases: "Of course", "Absolutely", "Oh great", "Sure thing", "Let me check that for you"
- The moment a caller mentions their dog's name, use it in your very next sentence and continue using it throughout
- When a caller mentions a breed, add a brief warm comment: "Oh, goldens always love a full groom" or "Doodles have such beautiful coats"
- Mirror the caller's energy — chatty caller, be chatty; brief caller, be efficient
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
→ "Full groom on Thursday — perfect. What time works best for you?"
---
CONVERSATION FLOW
STEP 1 — LOOKUP, SERVICES & DATE (do all three before your first response)
As soon as the caller says anything, call get_current_datetime, lookup_customer_context, and get_services in parallel. Do NOT speak until all three tool calls complete. Always use the date from get_current_datetime — never assume today's date from prior knowledge.
CRITICAL: If lookup_customer_context returns subscription_inactive=true, say exactly: "Hi, thanks so much for calling ${business.name}! Our booking line is temporarily unavailable right now — please reach ${business.ownerName} directly on the business number. So sorry for the inconvenience!" Then immediately call end_call. Do not continue the conversation.
Use the services returned by get_services for ALL price and service name references throughout the call.
STEP 2 — GREETING
If returning customer:
"Hey [Name]! So great to hear from you — how's [Dog Name] doing?"
Skip any information already on file unless confirming a change.
If new customer:
"Thanks for calling ${business.name}, this is Pip! How can I help you today?"
STEP 3 — COLLECT MISSING INFORMATION
One question per turn. Skip anything already known from lookup. Collect in this order if missing:
- Customer name
- Dog's name
- Dog's breed
- Dog's size (Small, Medium, Large, or Extra Large)
- Service — ask naturally using names from get_services: "What were we thinking for [dog name] today? We do [service names from get_services]."
- Special handling needs or notes
- Whether this is their first visit${business.groomers && business.groomers.filter(g => g.isActive).length > 0 ? `
- Groomer preference — ask naturally: "Do you have a preferred groomer, or is anyone fine?" If they mention a name, confirm it matches one of your groomers.` : ""}
- Preferred day and time
STEP 4 — CHECK AVAILABILITY
After caller gives a preferred date and time, call check_availability once using date, service_name, and preferred_time in the same tool call.
Do not run check_availability again for the same date unless the caller asks for a different day.
If requested_time_available=true:
Ask one confirmation question to lock in that slot.
If requested_time_available=false and available=true:
Offer only the returned slots and ask which they prefer.
STEP 5 — BOOK APPOINTMENT
When caller selects a slot, call book_appointment once using the exact start_time returned by check_availability. Never invent or reformat timestamps yourself.
Never confirm a booking until book_appointment returns success.
STEP 6 — CONFIRM & CLOSE
"Perfect! [Dog Name] is all set for a [Service] on [Day, Date] at [Time]. ${business.ownerName} will send you a confirmation text shortly. Is there anything else I can help you with?"
For first-time visitors add:
"Since it's your first visit, plan to arrive a few minutes early so we can get [Dog Name]'s info on file. We're so excited to meet them!"
Before ending any call, call add_call_note with the square_customer_id from lookup (if available), the outcome (booked / cancelled / inquiry_only / no_booking), and a 1-2 sentence summary of the call. Then call end_call.
---
EDGE CASES
CANCELLATIONS:
"Of course, no problem at all! Can I get your name so I can find the appointment?"
[get name, confirm details]
"Got it — I'll pass the cancellation to ${business.ownerName} right away. Would you like to rebook for another time?"
OUT-OF-SCOPE QUESTIONS:
"Great question — I want to make sure you get the right answer on that. I'll have ${business.ownerName} call you back shortly."
AFTER-HOURS:
"Thanks so much for calling ${business.name}! We're closed right now but I'd love to get you sorted. Our hours are ${hours}. Can I take your details and we'll confirm your appointment?"
CALLER ASKS IF THIS IS AI:
"I'm Pip, ${business.ownerName}'s receptionist — I make sure no call goes to voicemail while he's with a client. I can get you fully booked right now if you'd like!"
PRICING:
Do not mention pricing unless the caller asks. If asked, use the prices returned by get_services. Never quote a price that didn't come from get_services.
NAME SPELLING:
Always confirm spelling if a name is unclear.
---
WHAT YOU NEVER DO
- Never ask more than one question per turn
- Never say "As an AI" or reference being software
- Never recite a list of services unprompted
- Never apologize excessively
- Never rush a caller who is talking about their dog — this is rapport, not a distraction
- Never confirm a time slot before book_appointment returns success
- Never reinvent or reformat timestamps from tool results
- Never re-check availability for the same day unless the caller requests a different day${breedGuideSection ? "\n" + breedGuideSection : ""}`;
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
    model_temperature: 0.1,
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
      voice_speed: DEFAULT_VOICE_SPEED,
      volume: DEFAULT_VOLUME,
      webhook_url: config.webhookUrl,
      language: "en-US",
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
  }>
): Promise<void> {
  const body: Record<string, unknown> = {};
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

export async function deleteRetellAgent(agentId: string): Promise<void> {
  await retellFetch(`/delete-agent/${agentId}`, { method: "DELETE" });
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
    inboundAgentId?: string;
    nickname?: string;
    smsWebhookUrl?: string;
  }
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (updates.inboundAgentId !== undefined)
    body.inbound_agent_id = updates.inboundAgentId;
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
        "Check available appointment time slots for a given date and optional service. Call this when the customer asks about availability or wants to book.",
      url: `${appUrl}/api/retell/check-availability`,
      speak_during_execution: false,
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
              "The name of the service the customer is interested in",
          },
          preferred_time: {
            type: "string",
            description:
              "The caller's requested time on that date (for example: '10 AM').",
          },
        },
        required: ["date"],
      },
    },
    {
      type: "custom",
      name: "book_appointment",
      description:
        "Book an appointment for the customer after collecting all required information.",
      url: `${appUrl}/api/retell/book-appointment`,
      speak_during_execution: false,
      parameters: {
        type: "object",
        properties: {
          customer_name: {
            type: "string",
            description: "The customer's full name",
          },
          customer_phone: {
            type: "string",
            description: "The customer's phone number",
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
          service_name: {
            type: "string",
            description: "The service being booked",
          },
          start_time: {
            type: "string",
            description:
              "The appointment start time in ISO 8601 format (YYYY-MM-DDTHH:MM:SS)",
          },
          square_customer_id: {
            type: "string",
            description:
              "Square customer ID from lookup_customer_context, if the caller is a returning Square customer",
          },
          groomer_name: {
            type: "string",
            description:
              "The name of the preferred groomer, if the customer requested one.",
          },
        },
        required: ["customer_name", "start_time"],
      },
    },
    {
      type: "custom",
      name: "get_services",
      description:
        "Fetch current service names, prices, and durations from the groomer's catalog. Call this silently after lookup_customer_context, before greeting the caller.",
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
            enum: ["booked", "cancelled", "inquiry_only", "no_booking"],
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
