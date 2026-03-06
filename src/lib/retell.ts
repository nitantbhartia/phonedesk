import { prisma } from "./prisma";
import type { Business, RetellConfig, Service } from "@prisma/client";

const RETELL_BASE_URL = "https://api.retellai.com";
const RETELL_MODEL = process.env.RETELL_MODEL || "gemini-2.5-flash";

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

export interface AgentPersonality {
  tone?: string;       // "friendly" | "professional" | "bubbly" | "calm"
  style?: string;      // "concise" | "conversational" | "detailed"
  language?: string;   // "casual" | "formal"
  customInstructions?: string;
}

export function generateSystemPrompt(
  business: Business & { services: Service[] },
  personality?: AgentPersonality | null
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
    : "Monday-Saturday 9am-5pm";

  const toneMap: Record<string, string> = {
    friendly: "friendly, warm, and approachable",
    professional: "professional, polished, and courteous",
    bubbly: "upbeat, enthusiastic, and energetic",
    calm: "calm, soothing, and reassuring",
  };
  const styleMap: Record<string, string> = {
    concise: "Keep responses brief and to the point.",
    conversational: "Be conversational and natural, like chatting with a neighbor.",
    detailed: "Be thorough and provide helpful details proactively.",
  };
  const languageMap: Record<string, string> = {
    casual: "Use casual, everyday language. Contractions are great.",
    formal: "Use polite, formal language. Avoid slang and contractions.",
  };

  const tone = toneMap[personality?.tone || "friendly"] || toneMap.friendly;
  const style = styleMap[personality?.style || "conversational"] || styleMap.conversational;
  const languageStyle = languageMap[personality?.language || "casual"] || languageMap.casual;
  const customInstructions = personality?.customInstructions?.trim();

  const isHardBook = business.bookingMode === "HARD";

  return `You are a ${tone} AI receptionist for ${business.name}, a pet grooming business. The owner is ${business.ownerName}.

Your role is to help callers schedule appointments. You are fully authorized to check availability and book appointments directly — do NOT tell callers you need to check with the owner or have them call back for booking-related requests.

## Business Information
- Business: ${business.name}
- Owner: ${business.ownerName}
- Location: ${business.address || business.city || "Not specified"}
- Hours: ${hours}
- Booking mode: ${isHardBook ? "Direct booking (appointments are confirmed immediately)" : "Soft booking (the time slot is held for the customer, but the groomer will confirm via text)"}
- Today's date: {{current_date}} ({{current_date_iso}})

CRITICAL DATE RULES:
- Today is {{current_date_iso}}. The current year is derived from this date.
- When passing a date to the check_availability or book_appointment tool, use {{current_date_iso}} as your anchor and calculate from it. For example, if today is 2026-03-06, "next Monday" is 2026-03-09 or later.
- NEVER use dates from 2024 or 2025 or any past year. Always double-check the year before calling a tool.
- When a caller says "today", "tomorrow", "next Monday", etc., calculate the correct YYYY-MM-DD date relative to {{current_date_iso}}.
- NEVER make up or guess a date. Only mention dates that came from the check_availability tool response or that you calculated directly from {{current_date_iso}}.
- If the tool returns slot times, relay those exact times to the caller — do not substitute different dates or times.

## Services Offered
${serviceList || "- Full Groom\n- Bath & Brush\n- Nail Trim"}

## Caller Context (auto-populated)
{{customer_context}}

## Conversation Flow
1. The lookup_customer_context tool runs automatically at the start of every call. When it returns, READ THE RESULT CAREFULLY — it contains the caller's name, pet info, visit history, and everything you already know. Use this data to personalize the conversation and skip questions you already have answers for.
2. In your FIRST response after the lookup completes, personalize based on what the tool returned:
   - **Returning customer (tool returned customer data):** Greet them by name warmly and ask ONE question. Example: "Oh hey Nitant! Good to hear from you — what are we booking for Rexi today?" That's it — greeting plus one question. Do NOT also ask about scheduling, service type, or anything else in the same turn. Wait for their answer before asking the next thing.
   - **New customer (tool returned no record found):** If the greeting already asked for their name, just continue naturally. Otherwise introduce yourself: "I can help you get an appointment set up. What's your name?" Then ask them to spell it.
3. Collect any MISSING info one question at a time — skip anything the lookup already provided. Use natural phrasing — not robotic form-filling:
   - "What's your pup's name?" (not "What is the dog's name?")
   - "What kind of dog is [name]?" (not "What is the breed?")
   - "And roughly what size — small, medium, large?" (skip if obvious from breed, e.g. Great Dane = large)
   - "What are we looking to get done today?" (service)
   - "Any day or time work best for you?" (scheduling preference)
   - Only ask about special handling or first-visit notes if the caller is new.
   If the caller volunteers extra info in their answer, acknowledge it and skip that question. Ask ONE question per turn.
4. Use the check_availability tool to find open slots. Important rules:
   - When the caller asks for a specific day AND time (e.g. "Monday at 2 PM"), pass both the date AND the preferred_time parameter. The result will tell you if that exact time is available.
   - If the requested time isn't available, the result already includes the closest alternatives. Read those directly to the caller — do NOT call check_availability again for the same date.
   - If check_availability returns available: false (day fully booked), the result already includes the next available day WITH its open time slots. Read those times to the caller immediately — do NOT ask "would you like me to check another day?" and do NOT make another check_availability call.
   - Never call check_availability more than once for the same date. Use the slots already returned.
   - Do NOT ask the caller to repeat info they already gave you.
5. Once you have a confirmed time (either chosen by the caller or confirmed available), use the book_appointment tool immediately — do not ask for additional confirmation.
6. ${isHardBook
    ? "Confirm the booking warmly: \"You're all set! You'll get a confirmation text shortly.\""
    : "Let them know the time is held: \"I've got that time saved for you — the groomer will text you shortly to confirm.\""}

## Conversational Style
- ${style}
- ${languageStyle}
- Sound like a real person who works at a grooming shop — warm, relaxed, and genuinely interested in the caller's pet. Use phrases like "Aw, cute name!" or "Oh nice, we love doodles" when natural.
- Vary your acknowledgements — don't repeat the same one. Mix it up: "Love it." "Sounds good." "Awesome." "Cool, got it." "Oh perfect."
- STRICT RULE — exactly ONE question per turn. Never stack two or more questions in the same response. Wrong: "Which pup? And what day works?" Right: "Which pup are we booking for?" (wait for answer, then ask about the day next turn).
- Always end your turn with that one question — never end on just a statement with no question. Combine a short acknowledgment with the question: "Got it, large goldendoodle. What are we looking to get done for Rexi today?"
- IMPORTANT: When you call a tool like check_availability or book_appointment, do NOT narrate that you're about to check or look something up. The system automatically says a filler message while the tool runs. Just call the tool silently — your next spoken words should be the RESULT (e.g., "We've got openings at 9, 10, and 11 AM."). Never say "Let me check that for you" or "One moment while I look that up" before a tool call.

## Important Rules
- You MUST use the book_appointment tool to book appointments. Never say you'll "pass it along" or "have someone call back" — you handle bookings directly.
- For new callers, ALWAYS ask them to spell their name: "And could you spell that for me?" Never assume the spelling.
- If the caller asks something unrelated to booking: "I'll have ${business.ownerName} get back to you on that!"
- If a caller wants to cancel, say you'll pass the message to ${business.ownerName}.
- Do NOT bring up pricing unless asked. When asked, use the get_quote tool.
- For returning customers, skip intake questions for info already on file. Jump straight to one question: "What are we booking today?"
- NEVER ask for the caller's phone number. It's automatically captured from the call. If you need it for booking, use the number they called from.

## SMS Notifications
If a {{notification_message}} is provided, you are being used to deliver an SMS notification. Send the notification_message exactly as written — do not rephrase, add commentary, or start a conversation. Just deliver the message.${customInstructions ? `\n\n## Additional Instructions from Business Owner\n${customInstructions}` : ""}`;
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
    "mon-fri": "Monday-Friday",
    monday: "Monday",
    tuesday: "Tuesday",
    wednesday: "Wednesday",
    thursday: "Thursday",
    friday: "Friday",
    saturday: "Saturday",
    sunday: "Sunday",
  };

  return Object.entries(hours)
    .filter(([, v]) => v && v.open && v.close)
    .map(
      ([day, { open, close }]) => `${dayNames[day] || day}: ${open}-${close}`
    )
    .join(", ");
}

export function generateGreeting(business: Business): string {
  // Keep begin_message short and neutral — personalization happens in the
  // agent's first generated response via {{customer_context}} in the system
  // prompt. The begin_message is spoken BEFORE our webhook can inject
  // per-caller context, so it must work for both new and returning callers.
  return `Thanks for calling ${business.name}! Give me one sec.`;
}

// --- Retell LLM (Response Engine) ---

export async function createRetellLLM(config: {
  generalPrompt: string;
  beginMessage: string;
  tools?: RetellTool[];
}): Promise<{ llm_id: string }> {
  const now = new Date();
  const currentDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const currentDateIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(now);

  const body: Record<string, unknown> = {
    model: RETELL_MODEL,
    start_speaker: "agent",
    general_prompt: config.generalPrompt,
    begin_message: config.beginMessage,
    model_temperature: 0.2,
    tool_call_strict_mode: true,
    retell_llm_dynamic_variables: {
      current_date: currentDate,
      current_date_iso: currentDateIso,
      customer_context: "No prior customer record found. Treat as a new customer.",
    },
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
  const now = new Date();
  const currentDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const currentDateIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(now);

  const body: Record<string, unknown> = {};
  if (updates.generalPrompt !== undefined)
    body.general_prompt = updates.generalPrompt;
  if (updates.beginMessage !== undefined)
    body.begin_message = updates.beginMessage;
  if (updates.tools !== undefined) body.general_tools = updates.tools;
  body.start_speaker = "agent";
  body.retell_llm_dynamic_variables = {
    current_date: currentDate,
    current_date_iso: currentDateIso,
    customer_context: "No prior customer record found. Treat as a new customer.",
  };

  await retellFetch(`/update-retell-llm/${llmId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

/**
 * Refresh dynamic variables on the LLM at call start.
 * Sets the current date and customer context so the agent has accurate info.
 * Uses update-retell-llm (global) since update-call doesn't reliably support
 * retell_llm_dynamic_variables. The lookup_customer_context tool is always
 * called first by the agent as a reliable per-call backup.
 */
export async function refreshRetellLLMForCall(
  llmId: string,
  customerContext?: string | null
): Promise<void> {
  const now = new Date();
  const currentDate = now.toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const currentDateIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
  }).format(now);

  const vars: Record<string, string> = {
    current_date: currentDate,
    current_date_iso: currentDateIso,
    customer_context: customerContext || "No prior customer record found. Treat as a new customer.",
  };

  await retellFetch(`/update-retell-llm/${llmId}`, {
    method: "PATCH",
    body: JSON.stringify({
      retell_llm_dynamic_variables: vars,
    }),
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
      voice_id: config.voiceId || "11labs-Adrian",
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
  }>
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (updates.agentName) body.agent_name = updates.agentName;
  if (updates.voiceId) body.voice_id = updates.voiceId;
  if (updates.webhookUrl) body.webhook_url = updates.webhookUrl;

  await retellFetch(`/update-agent/${agentId}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteRetellAgent(agentId: string): Promise<void> {
  await retellFetch(`/delete-agent/${agentId}`, { method: "DELETE" });
}

// --- Phone Number Provisioning ---

export async function provisionRetellPhoneNumber(options: {
  agentId: string;
  areaCode?: number;
  nickname?: string;
  smsWebhookUrl?: string;
}): Promise<{ phone_number: string }> {
  const body: Record<string, unknown> = {
    area_code: options.areaCode || 415,
    inbound_agent_id: options.agentId,
    nickname: options.nickname || "RingPaw AI Line",
  };

  if (options.smsWebhookUrl) {
    body.inbound_sms_webhook_url = options.smsWebhookUrl;
  }

  return retellFetch("/create-phone-number", {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function updateRetellPhoneNumber(
  phoneNumber: string,
  updates: { inboundAgentId?: string }
): Promise<void> {
  const body: Record<string, unknown> = {};
  if (updates.inboundAgentId) body.inbound_agent_id = updates.inboundAgentId;

  await retellFetch(`/update-phone-number/${encodeURIComponent(phoneNumber)}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  });
}

export async function deleteRetellPhoneNumber(
  phoneNumber: string
): Promise<void> {
  await retellFetch(`/delete-phone-number/${encodeURIComponent(phoneNumber)}`, {
    method: "DELETE",
  });
}

// --- SMS Sending ---

// Send an outbound SMS via Retell's create-sms-chat endpoint.
// The notification_message dynamic variable instructs the agent to relay it verbatim.
export async function sendSms(
  to: string,
  body: string,
  from?: string,
  { retries = 2 }: { retries?: number } = {}
): Promise<void> {
  if (!from) {
    throw new Error("From number is required for Retell SMS");
  }

  let lastError: Error | undefined;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
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
      return;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (attempt < retries) {
        await new Promise((r) => setTimeout(r, 1000 * 2 ** attempt));
      }
    }
  }

  throw lastError ?? new Error("Failed to send SMS");
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
      name: "lookup_customer_context",
      description:
        "ALWAYS call this tool FIRST at the start of every call before saying anything else. It checks if the caller is a returning customer and retrieves their name, pet info, and visit history. IMPORTANT: When this tool returns data, you MUST use it. If a customer name, pet name, breed, or size is returned, do NOT ask for that information again — greet them by name, reference their pet, and skip straight to scheduling. No parameters needed — the caller's phone number is provided automatically.",
      url: `${appUrl}/api/retell/lookup-customer`,
      speak_during_execution: true,
      speak_after_execution: true,
      execution_message_description: "Give me one second while I pull up your info...",
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
      speak_during_execution: true,
      speak_after_execution: true,
      execution_message_description: "Let me check our availability for you...",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description:
              "The date to check availability for. Can be YYYY-MM-DD, a day name like 'Monday', or natural language like 'next Tuesday'. Today is {{current_date_iso}}.",
          },
          service_name: {
            type: "string",
            description:
              "The name of the service the customer is interested in",
          },
          preferred_time: {
            type: "string",
            description:
              "The specific time the customer requested, e.g. '2:00 PM' or '10 AM'. When provided, the result will indicate if that exact time is available and show the closest alternatives if not.",
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
      speak_during_execution: true,
      speak_after_execution: true,
      execution_message_description:
        "Let me get that booked for you...",
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
        },
        required: ["customer_name", "start_time"],
      },
    },
    {
      type: "custom",
      name: "get_quote",
      description:
        "Get a price quote for a specific breed, size, and service combination. Call when customer asks about pricing.",
      url: `${appUrl}/api/retell/get-quote`,
      speak_during_execution: false,
      parameters: {
        type: "object",
        properties: {
          breed: {
            type: "string",
            description: "Dog breed",
          },
          size: {
            type: "string",
            description: "Dog size",
            enum: ["SMALL", "MEDIUM", "LARGE", "XLARGE"],
          },
          service_name: {
            type: "string",
            description: "Service name",
          },
        },
        required: ["service_name"],
      },
    },
    {
      type: "end_call",
      name: "end_call",
      description:
        "End the call after the booking is confirmed or the conversation is complete.",
    },
  ];
}

// --- Build Full Config ---

export function buildAgentConfig(
  business: Business & { services: Service[] },
  retellConfig?: { voiceId?: string | null; personality?: AgentPersonality | null; greeting?: string | null } | null
) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return {
    agentName: `${business.name} Receptionist`,
    generalPrompt: generateSystemPrompt(business, retellConfig?.personality),
    beginMessage: retellConfig?.greeting?.trim() || generateGreeting(business),
    voiceId: retellConfig?.voiceId || "11labs-Adrian",
    webhookUrl: `${appUrl}/api/retell/webhook`,
    tools: buildAgentTools(appUrl),
  };
}

type SyncableBusiness = Business & {
  services: Service[];
  retellConfig?: RetellConfig | null;
};

export async function syncRetellAgent(business: SyncableBusiness) {
  const config = buildAgentConfig(business, business.retellConfig as { voiceId?: string | null; personality?: AgentPersonality | null; greeting?: string | null } | null);
  const existingConfig = business.retellConfig;

  // Try to update existing LLM + agent on Retell
  if (existingConfig?.agentId && existingConfig.llmId) {
    try {
      await updateRetellLLM(existingConfig.llmId, {
        generalPrompt: config.generalPrompt,
        beginMessage: config.beginMessage,
        tools: config.tools,
      });

      await updateRetellAgent(existingConfig.agentId, {
        agentName: config.agentName,
        voiceId: config.voiceId,
        webhookUrl: config.webhookUrl,
      });

      return prisma.retellConfig.update({
        where: { businessId: business.id },
        data: {
          systemPrompt: config.generalPrompt,
          voiceId: config.voiceId,
          greeting: config.beginMessage,
        },
      });
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      // If the LLM or agent was deleted on Retell, fall through to recreate
      if (errorMsg.includes("not found") || errorMsg.includes("404")) {
        console.warn("[Retell Sync] Stored LLM/agent no longer exists on Retell, recreating...", {
          llmId: existingConfig.llmId,
          agentId: existingConfig.agentId,
        });
      } else {
        // Non-404 errors should still propagate
        throw error;
      }
    }
  }

  // Create fresh LLM + agent (either first time or stale IDs)
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

  console.log("[Retell Sync] Created new LLM:", llm.llm_id, "agent:", agent.agent_id);

  // Re-link the phone number to the new agent
  const phoneNumber = await prisma.phoneNumber.findFirst({
    where: { businessId: business.id },
  });
  if (phoneNumber) {
    try {
      await updateRetellPhoneNumber(phoneNumber.number, {
        inboundAgentId: agent.agent_id,
      });
      console.log("[Retell Sync] Re-linked phone", phoneNumber.number, "to new agent", agent.agent_id);
    } catch (phoneError) {
      console.error("[Retell Sync] Failed to re-link phone number:", phoneError);
      // Don't throw — the agent was created successfully, phone linking can be retried
    }
  }

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
