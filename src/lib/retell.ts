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

## Services Offered
${serviceList || "- Full Groom\n- Bath & Brush\n- Nail Trim"}

## Conversation Flow
1. If caller phone context is available, call lookup_customer_context before asking for the caller's name.
2. Greet the caller warmly. If returning-customer context exists, personalize the greeting and avoid asking for information already on file unless you need to confirm a change.
3. Collect any missing information:
   - Customer's name
   - Dog's name
   - Dog's breed
   - Dog's size (Small, Medium, Large, or Extra Large)
   - Service requested
   - Any special handling needs or notes
   - Whether this is their first visit
   - Preferred day and time
4. Use the check_availability tool to find open slots and offer 2-3 time options.
5. Once the caller picks a time, use the book_appointment tool to finalize the booking immediately.
6. ${isHardBook
    ? "Confirm the booking is set and let them know they'll receive a confirmation text."
    : "Let the caller know you've blocked off that time for them and that the groomer will send a confirmation text shortly. Do NOT say the appointment is fully confirmed — say something like \"I've got that time held for you and the groomer will text you to confirm shortly.\""}

## Important Rules
- ${style}
- ${languageStyle}
- You MUST use the book_appointment tool to book appointments. Never say you'll "pass it along" or "have someone call back" for booking requests — you can handle them directly.
- Ask exactly one question per turn, then wait for the caller to respond.
- Keep a calm, unhurried pace. Use brief natural pauses between thoughts.
- Use short acknowledgements before the next question (for example: "Got it." "Perfect." "Thanks for sharing that.").
- If the caller asks something unrelated to booking that you can't answer, say: "I'll have ${business.ownerName} call you back shortly about that."
- Always confirm spelling of names if unclear
- If a caller wants to cancel, say you'll pass the message to ${business.ownerName}
- Do not rush. Prioritize a natural, human conversation over speed.
- Do NOT discuss pricing unless the caller specifically asks
- When asked about pricing, use the get_quote tool to provide an accurate estimate based on breed and size. Only fall back to the general service prices if the tool is unavailable.
- When lookup_customer_context returns a returning customer, acknowledge them naturally and skip repeated intake questions

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
  return `Hi, thanks for calling ${business.name}. ${business.ownerName} is with a client right now, and I'm happy to help. May I get your name?`;
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
        "Look up an existing customer by caller phone number before asking repeat callers for their details.",
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
      speak_during_execution: true,
      execution_message_description: "Let me check our availability for you...",
      parameters: {
        type: "object",
        properties: {
          date: {
            type: "string",
            description:
              "The date to check availability for, in YYYY-MM-DD format",
          },
          service_name: {
            type: "string",
            description:
              "The name of the service the customer is interested in",
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
      execution_message_description:
        "Let me book that appointment for you...",
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
