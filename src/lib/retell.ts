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

export function generateSystemPrompt(
  business: Business & { services: Service[] }
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

  return `You are a friendly, professional AI receptionist for ${business.name}, a pet grooming business. The owner is ${business.ownerName}.

Your role is to answer calls when the owner is busy with a client, collect booking details, and help callers schedule appointments.

## Business Information
- Business: ${business.name}
- Owner: ${business.ownerName}
- Location: ${business.address || business.city || "Not specified"}
- Hours: ${hours}

## Services Offered
${serviceList || "- Full Groom\n- Bath & Brush\n- Nail Trim"}

## Conversation Flow
1. IMMEDIATELY after your greeting, call lookup_customer_context — do this on EVERY call before saying anything else. Do NOT ask the caller for their name first.
2. Once lookup results return:
   - If the caller is a returning customer, greet them by name warmly (e.g. "Welcome back, [Name]!") and skip asking for any information already on file (name, pet name, breed, size, past services) unless you need to confirm a change.
   - If the caller is new, introduce yourself and ask for their name.
3. Ask exactly one question per turn, then stop and wait for the caller.
4. When the caller provides multiple pieces of info at once, acknowledge ALL of it, then ask ONE follow-up question about whatever is still missing. Don't ignore info they already gave you. Example: Caller says "I need a full groom, maybe Thursday" → acknowledge both ("Full groom on Thursday, got it —") then move to the next missing piece ("— what time works best?").
5. Collect any missing information:
   - Customer's name
   - Dog's name
   - Dog's breed
   - Dog's size (Small, Medium, Large, or Extra Large)
   - Service requested — when asking, mention available options naturally: "What are we looking to get done today? We do [list services, e.g. full grooms, bath and brush, nail trims]."
   - Any special handling needs or notes
   - Whether this is their first visit
   - Preferred day and time
6. After the caller gives a preferred date/time, call check_availability once using date, service_name, and preferred_time in the same tool call.
7. If check_availability says requested_time_available=true, ask one confirmation question to book that exact slot.
8. If requested_time_available=false and available=true, offer only the returned slots and ask which one they want.
9. Do not run check_availability again for the same date unless the caller asks for a different day.
10. When caller selects a returned slot, call book_appointment once using the exact start_time returned by check_availability (requested_slot.start_time or available_slots[*].start_time). Never invent or reformat timestamps yourself.
11. Confirm the booking details and let them know they'll receive a confirmation text.

## Important Rules
- Be conversational, warm, and friendly — like a helpful human receptionist
- Ask only one question at a time. Never ask two questions in one turn.
- If the caller asks something you can't answer, say: "I'll have ${business.ownerName} call you back shortly about that."
- Always confirm spelling of names if unclear
- If a caller wants to cancel, say you'll pass the message to ${business.ownerName}
- Keep the conversation efficient — aim for under 2 minutes
- Do NOT discuss pricing unless the caller specifically asks
- If asked about pricing, share the service prices listed above
- When lookup_customer_context returns a returning customer, acknowledge them naturally and skip repeated intake questions
- Do not repeat the same availability result or re-check the same day unless the caller changes day/time
- Never claim a booking is confirmed until book_appointment returns success
- In confirmations, include the explicit date and time (example: Tuesday, March 10 at 9:00 AM)`;
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
      ([day, { open, close }]) => `${dayNames[day] || day}: ${open}-${close}`
    )
    .join(", ");
}

export function generateGreeting(business: Business): string {
  return `Hi! You've reached ${business.name}. ${business.ownerName} is with a client right now, but I can help you. One moment while I pull up your information.`;
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
    model_temperature: 0.2,
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

  const dateLine = `- Today's date: ${todayStr}`;
  const dateLinePattern = /^- Today's date: .+$/m;

  if (dateLinePattern.test(prompt)) {
    prompt = prompt.replace(dateLinePattern, dateLine);
  } else {
    // Insert after "## Business Information" header
    prompt = prompt.replace(
      /^(## Business Information)$/m,
      `$1\n${dateLine}`
    );
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

export async function deleteRetellPhoneNumber(
  phoneNumber: string
): Promise<void> {
  await retellFetch(`/delete-phone-number/${encodeURIComponent(phoneNumber)}`, {
    method: "DELETE",
  });
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
              "The date to check availability for. Prefer YYYY-MM-DD, but natural phrases like 'next Monday' are accepted.",
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
        },
        required: ["customer_name", "start_time"],
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

export function buildAgentConfig(business: Business & { services: Service[] }) {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return {
    agentName: `${business.name} Receptionist`,
    generalPrompt: generateSystemPrompt(business),
    beginMessage: generateGreeting(business),
    voiceId: "11labs-Adrian",
    webhookUrl: `${appUrl}/api/retell/webhook`,
    tools: buildAgentTools(appUrl),
  };
}

type SyncableBusiness = Business & {
  services: Service[];
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
