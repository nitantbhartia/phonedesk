import type { Business, Service } from "@prisma/client";

const VAPI_API_KEY = process.env.VAPI_API_KEY;
const VAPI_BASE_URL = "https://api.vapi.ai";

interface VapiAssistantConfig {
  name: string;
  model: {
    provider: string;
    model: string;
    systemMessage: string;
  };
  voice: {
    provider: string;
    voiceId: string;
  };
  firstMessage: string;
  endCallMessage: string;
  serverUrl: string;
}

export function generateSystemPrompt(
  business: Business & { services: Service[] }
): string {
  const serviceList = business.services
    .filter((s) => s.isActive)
    .map((s) => `- ${s.name}: $${s.price} (${s.duration} minutes)`)
    .join("\n");

  const hours = business.businessHours
    ? formatBusinessHours(business.businessHours as Record<string, { open: string; close: string }>)
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
1. Greet the caller warmly: "Hi! You've reached ${business.name}. ${business.ownerName} is with a client right now, but I can help you book an appointment. What's your name?"
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
- If asked about pricing, share the service prices listed above

## Data Collection
After the call, output a JSON summary with these fields:
- customerName
- dogName
- breed
- size (SMALL, MEDIUM, LARGE, XLARGE)
- service
- isFirstVisit
- specialNeeds
- preferredDay
- preferredTime
- callerPhone`;
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
    .map(([day, { open, close }]) => `${dayNames[day] || day}: ${open}-${close}`)
    .join(", ");
}

export function generateGreeting(business: Business): string {
  return `Hi! You've reached ${business.name}. ${business.ownerName} is with a client right now, but I can help you book an appointment. What's your name?`;
}

export async function createVapiAssistant(
  config: VapiAssistantConfig
): Promise<{ id: string }> {
  if (!VAPI_API_KEY) throw new Error("Vapi API key not configured");

  const response = await fetch(`${VAPI_BASE_URL}/assistant`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: config.name,
      model: config.model,
      voice: config.voice,
      firstMessage: config.firstMessage,
      endCallMessage: config.endCallMessage,
      serverUrl: config.serverUrl,
    }),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vapi API error: ${error}`);
  }

  return response.json();
}

export async function updateVapiAssistant(
  assistantId: string,
  updates: Partial<VapiAssistantConfig>
): Promise<void> {
  if (!VAPI_API_KEY) throw new Error("Vapi API key not configured");

  const response = await fetch(`${VAPI_BASE_URL}/assistant/${assistantId}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${VAPI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(updates),
  });

  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Vapi API error: ${error}`);
  }
}

export function buildAssistantConfig(
  business: Business & { services: Service[] }
): VapiAssistantConfig {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

  return {
    name: `${business.name} Receptionist`,
    model: {
      provider: "openai",
      model: "gpt-4o",
      systemMessage: generateSystemPrompt(business),
    },
    voice: {
      provider: "11labs",
      voiceId: "21m00Tcm4TlvDq8ikWAM", // Rachel - friendly female voice
    },
    firstMessage: generateGreeting(business),
    endCallMessage:
      "Thank you for calling! You'll receive a confirmation text shortly. Have a great day!",
    serverUrl: `${appUrl}/api/vapi/webhook`,
  };
}
