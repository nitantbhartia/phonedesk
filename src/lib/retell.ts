import type { Business, Service } from "@prisma/client";

const RETELL_BASE_URL = "https://api.retellai.com";

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
1. Greet the caller warmly
2. Collect the following information:
   - Customer's name
   - Dog's name
   - Dog's breed
   - Dog's size (Small, Medium, Large, or Extra Large)
   - Service requested
   - Any special handling needs or notes
   - Whether this is their first visit
   - Preferred day and time
3. Check availability and offer 2-3 time slot options
4. Confirm the booking details
5. Let them know they'll receive a confirmation text

## Important Rules
- Be conversational, warm, and friendly — like a helpful human receptionist
- If the caller asks something you can't answer, say: "I'll have ${business.ownerName} call you back shortly about that."
- Always confirm spelling of names if unclear
- If a caller wants to cancel, say you'll pass the message to ${business.ownerName}
- Keep the conversation efficient — aim for under 2 minutes
- Do NOT discuss pricing unless the caller specifically asks
- If asked about pricing, share the service prices listed above`;
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
  return `Hi! You've reached ${business.name}. ${business.ownerName} is with a client right now, but I can help you book an appointment. What's your name?`;
}

// --- Retell LLM (Response Engine) ---

export async function createRetellLLM(config: {
  generalPrompt: string;
  beginMessage: string;
  tools?: RetellTool[];
}): Promise<{ llm_id: string }> {
  const body: Record<string, unknown> = {
    model: "gpt-4o",
    general_prompt: config.generalPrompt,
    begin_message: config.beginMessage,
    model_temperature: 0.3,
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
