/**
 * sms-ai.ts
 *
 * AI handler for inbound customer SMS messages.
 * Runs a Gemini tool-calling loop to handle booking, cancellation,
 * availability checks, and appointment status — all via text.
 *
 * Conversation state is persisted in SmsConversation so multi-turn
 * exchanges (e.g. "check availability" → "book it") work across messages.
 */

import { GoogleGenAI } from "@google/genai";
import type { Content, Part } from "@google/genai";
import { prisma } from "./prisma";
import {
  getAvailableSlots,
  bookAppointment,
  isSlotAvailable,
  parseLocalDatetime,
} from "./calendar";
import {
  lookupCustomerContext,
  buildCustomerContextSummary,
  upsertCustomerMemory,
} from "./customer-memory";
import {
  sendBookingNotificationToOwner,
  sendBookingConfirmationToCustomer,
  sendCancellationWithWaitlistNotification,
} from "./notifications";
import { tryFillFromWaitlist } from "./waitlist";
import { canCancelAppointment } from "./appointment-state";

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Conversations expire after 30 minutes of inactivity */
const CONVERSATION_TTL_MS = 30 * 60 * 1000;

/** Maximum tool-call rounds per SMS message (prevents runaway loops) */
const MAX_TOOL_ITERATIONS = 5;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type StoredMessage = {
  role: "user" | "assistant";
  content: string;
  ts: number;
};

type ServiceRow = {
  id: string;
  name: string;
  duration: number;
  price: number;
  isActive: boolean;
};

type BusinessRow = {
  id: string;
  name: string;
  ownerName: string;
  phone: string | null;
  phoneNumber: { number: string } | null;
};

// ---------------------------------------------------------------------------
// Gemini client
// ---------------------------------------------------------------------------

function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set");
  return new GoogleGenAI({ apiKey });
}

// ---------------------------------------------------------------------------
// Conversation state helpers
// ---------------------------------------------------------------------------

async function loadConversation(
  businessId: string,
  customerPhone: string
): Promise<StoredMessage[]> {
  const record = await prisma.smsConversation.findUnique({
    where: { businessId_customerPhone: { businessId, customerPhone } },
  });

  if (!record) return [];

  const ageMs = Date.now() - new Date(record.lastMessageAt).getTime();
  if (ageMs > CONVERSATION_TTL_MS) {
    await prisma.smsConversation
      .delete({ where: { id: record.id } })
      .catch(() => {});
    return [];
  }

  return (record.messages as StoredMessage[]) || [];
}

async function saveConversation(
  businessId: string,
  customerPhone: string,
  messages: StoredMessage[]
): Promise<void> {
  // Keep last 20 stored messages (10 exchanges) to cap token usage
  const trimmed = messages.slice(-20);
  await prisma.smsConversation.upsert({
    where: { businessId_customerPhone: { businessId, customerPhone } },
    create: { businessId, customerPhone, messages: trimmed },
    update: { messages: trimmed, lastMessageAt: new Date() },
  });
}

function buildGeminiHistory(history: StoredMessage[]): Content[] {
  return history.map((msg) => ({
    role: msg.role === "user" ? "user" : "model",
    parts: [{ text: msg.content }],
  }));
}

// ---------------------------------------------------------------------------
// Date / time formatting helpers
// ---------------------------------------------------------------------------

function normalizeSmsDate(input: string, timezone: string): string {
  const todayInTz = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
  }).format(new Date());

  if (!input || /\btoday\b/i.test(input)) return todayInTz;

  if (/\btomorrow\b/i.test(input)) {
    const tom = new Date();
    tom.setDate(tom.getDate() + 1);
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(tom);
  }

  const WEEKDAYS: Record<string, number> = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  const wdMatch = input
    .toLowerCase()
    .match(
      /\b(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/
    );
  if (wdMatch) {
    const target = WEEKDAYS[wdMatch[1]];
    const now = new Date();
    const currentDay = now.getDay();
    const delta = ((target - currentDay + 7) % 7) || 7;
    const result = new Date(now);
    result.setDate(now.getDate() + delta);
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
      result
    );
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(input)) return input;

  const parsed = new Date(input);
  if (!isNaN(parsed.getTime())) {
    return new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(
      parsed
    );
  }

  return todayInTz;
}

function formatDate(ymd: string, timezone: string): string {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12)).toLocaleDateString("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

function formatSlotTime(date: Date, timezone: string): string {
  return date
    .toLocaleTimeString("en-US", {
      timeZone: timezone,
      hour: "numeric",
      minute: "2-digit",
    })
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Tool implementations
// These call the same underlying library functions the voice agent uses,
// bypassing the HTTP endpoint layer (which requires Retell auth headers).
// ---------------------------------------------------------------------------

async function toolCheckAvailability(
  businessId: string,
  timezone: string,
  services: ServiceRow[],
  args: { date: string; service_name: string; preferred_time?: string }
): Promise<Record<string, unknown>> {
  const service = services.find(
    (s) =>
      s.isActive &&
      s.name.toLowerCase().includes(args.service_name.toLowerCase())
  );

  if (!service) {
    const names = services
      .filter((s) => s.isActive)
      .map((s) => s.name)
      .join(", ");
    return {
      available: false,
      error: `Service not found. Available: ${names || "none"}`,
    };
  }

  const date = normalizeSmsDate(args.date, timezone);

  try {
    const slots = await getAvailableSlots(businessId, date, service.duration);

    if (slots.length === 0) {
      return {
        available: false,
        date,
        message: `No openings on ${formatDate(date, timezone)}.`,
      };
    }

    const offered = slots.slice(0, 3).map((s) => ({
      start_time: s.start.toISOString(),
      end_time: s.end.toISOString(),
      display_time: formatSlotTime(s.start, timezone),
    }));

    return {
      available: true,
      date,
      service_name: service.name,
      service_duration: service.duration,
      slots: offered,
      message: `Available on ${formatDate(date, timezone)}: ${offered
        .map((s) => s.display_time)
        .join(", ")}.`,
    };
  } catch (err) {
    console.error("[SMS AI] check_availability error:", err);
    return { available: false, error: "Could not check availability right now." };
  }
}

async function toolBookAppointment(
  businessId: string,
  customerPhone: string,
  timezone: string,
  services: ServiceRow[],
  business: BusinessRow,
  args: {
    customer_name: string;
    pet_name: string;
    pet_breed?: string;
    pet_size?: string;
    service_name: string;
    start_time: string;
  }
): Promise<Record<string, unknown>> {
  const service = services.find(
    (s) =>
      s.isActive &&
      s.name.toLowerCase().includes(args.service_name.toLowerCase())
  );

  if (!service) {
    return { booked: false, error: "Service not found." };
  }

  const VALID_SIZES = ["SMALL", "MEDIUM", "LARGE", "XLARGE"] as const;
  type PetSize = (typeof VALID_SIZES)[number];
  const sizeUpper = args.pet_size?.toUpperCase();
  const petSize: PetSize | undefined = VALID_SIZES.includes(
    sizeUpper as PetSize
  )
    ? (sizeUpper as PetSize)
    : undefined;

  const start = parseLocalDatetime(args.start_time, timezone);
  const end = new Date(start.getTime() + service.duration * 60_000);

  if (isNaN(start.getTime())) {
    return { booked: false, error: "Invalid appointment time." };
  }

  const slotOpen = await isSlotAvailable(businessId, start, end);
  if (!slotOpen) {
    return {
      booked: false,
      error: "That slot is no longer available. Please check availability again.",
    };
  }

  const appointment = await bookAppointment(businessId, {
    customerName: args.customer_name,
    customerPhone,
    petName: args.pet_name,
    petBreed: args.pet_breed,
    petSize,
    serviceName: service.name,
    servicePrice: service.price,
    startTime: start,
    endTime: end,
  });

  // Update customer memory (non-blocking)
  upsertCustomerMemory({
    businessId,
    customerName: args.customer_name,
    customerPhone,
    petName: args.pet_name,
    petBreed: args.pet_breed,
    petSize,
    serviceName: service.name,
    appointmentStart: start,
  }).catch((err) =>
    console.error("[SMS AI] upsertCustomerMemory failed (non-fatal):", err)
  );

  // Notifications (non-blocking)
  prisma.business
    .findUnique({ where: { id: businessId }, include: { phoneNumber: true } })
    .then((fullBusiness) => {
      if (!fullBusiness) return;
      return Promise.allSettled([
        sendBookingNotificationToOwner(
          fullBusiness as Parameters<typeof sendBookingNotificationToOwner>[0],
          appointment
        ),
        sendBookingConfirmationToCustomer(
          fullBusiness as Parameters<typeof sendBookingConfirmationToCustomer>[0],
          appointment
        ),
      ]);
    })
    .catch((err) =>
      console.error("[SMS AI] booking notification failed (non-fatal):", err)
    );

  const timeStr = start.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });

  return {
    booked: true,
    appointment_id: appointment.id,
    confirmed: appointment.status === "CONFIRMED",
    message: `Booked! ${args.pet_name}'s ${service.name} is set for ${timeStr}. You'll get a confirmation text shortly.`,
  };
}

async function toolCancelAppointment(
  businessId: string,
  customerPhone: string,
  timezone: string,
  business: BusinessRow & { ownerName: string },
  args: { appointment_id?: string; pet_name?: string }
): Promise<Record<string, unknown>> {
  const now = new Date();

  const appointment = args.appointment_id
    ? await prisma.appointment.findFirst({
        where: {
          id: args.appointment_id,
          businessId,
          customerPhone,
          status: { not: "CANCELLED" },
          startTime: { gte: now },
        },
      })
    : await prisma.appointment.findFirst({
        where: {
          businessId,
          customerPhone,
          status: { not: "CANCELLED" },
          startTime: { gte: now },
          ...(args.pet_name
            ? { petName: { contains: args.pet_name, mode: "insensitive" } }
            : {}),
        },
        orderBy: { startTime: "asc" },
      });

  if (!appointment) {
    return { cancelled: false, error: "No upcoming appointment found." };
  }

  if (
    !canCancelAppointment(
      appointment.status as Parameters<typeof canCancelAppointment>[0]
    )
  ) {
    return {
      cancelled: false,
      error: "That appointment can't be cancelled at this stage.",
    };
  }

  await prisma.appointment.update({
    where: { id: appointment.id },
    data: { status: "CANCELLED" },
  });

  const waitlistMatch = await tryFillFromWaitlist({
    ...appointment,
    business,
  });

  sendCancellationWithWaitlistNotification(
    business as Parameters<typeof sendCancellationWithWaitlistNotification>[0],
    appointment as Parameters<typeof sendCancellationWithWaitlistNotification>[1],
    waitlistMatch?.customerName
  ).catch((err) =>
    console.error("[SMS AI] cancellation notification failed (non-fatal):", err)
  );

  const timeStr = appointment.startTime.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });

  return {
    cancelled: true,
    appointment_id: appointment.id,
    message: `Cancelled. Your ${appointment.serviceName || "appointment"} on ${timeStr} has been cancelled. ${business.ownerName} has been notified.`,
  };
}

async function toolGetUpcomingAppointment(
  businessId: string,
  customerPhone: string,
  timezone: string
): Promise<Record<string, unknown>> {
  const appointment = await prisma.appointment.findFirst({
    where: {
      businessId,
      customerPhone,
      status: { in: ["CONFIRMED", "PENDING"] },
      startTime: { gte: new Date() },
    },
    orderBy: { startTime: "asc" },
  });

  if (!appointment) {
    return { found: false, message: "No upcoming appointments on file." };
  }

  const timeStr = appointment.startTime.toLocaleString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: timezone,
  });

  const groomingStatusText = appointment.groomingStatus
    ? `Grooming status: ${appointment.groomingStatus.replace(/_/g, " ").toLowerCase()}.`
    : "";

  return {
    found: true,
    appointment_id: appointment.id,
    pet_name: appointment.petName,
    service_name: appointment.serviceName,
    display_time: timeStr,
    status: appointment.status,
    grooming_status: appointment.groomingStatus,
    message: `${appointment.petName || "Your pet"}'s ${appointment.serviceName || "appointment"} is on ${timeStr}. ${groomingStatusText}`,
  };
}

// ---------------------------------------------------------------------------
// Tool definitions for Gemini function calling
// ---------------------------------------------------------------------------

const TOOL_DECLARATIONS = [
  {
    name: "check_availability",
    description:
      "Check available appointment slots for a given date and service. Always call this before booking.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        date: {
          type: "string",
          description:
            "Date to check, e.g. 'tomorrow', 'next Friday', '2026-03-20'",
        },
        service_name: {
          type: "string",
          description: "Name or partial name of the service, e.g. 'bath', 'full groom'",
        },
        preferred_time: {
          type: "string",
          description: "Optional preferred time, e.g. '2pm', 'morning', 'afternoon'",
        },
      },
      required: ["date", "service_name"],
    },
  },
  {
    name: "book_appointment",
    description:
      "Book an appointment. Only call after check_availability confirms slots and the customer has chosen a specific time.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        customer_name: { type: "string", description: "Customer's full name" },
        pet_name: { type: "string", description: "Pet's name" },
        pet_breed: { type: "string", description: "Pet's breed (optional)" },
        pet_size: {
          type: "string",
          description: "SMALL, MEDIUM, LARGE, or XLARGE (optional)",
        },
        service_name: {
          type: "string",
          description: "Service name matching one from the services list",
        },
        start_time: {
          type: "string",
          description:
            "ISO 8601 start time from check_availability, e.g. '2026-03-20T14:00:00'",
        },
      },
      required: ["customer_name", "pet_name", "service_name", "start_time"],
    },
  },
  {
    name: "cancel_appointment",
    description: "Cancel the customer's upcoming appointment.",
    parametersJsonSchema: {
      type: "object",
      properties: {
        appointment_id: {
          type: "string",
          description: "Appointment ID from get_upcoming_appointment (if known)",
        },
        pet_name: {
          type: "string",
          description: "Pet name to identify which appointment to cancel",
        },
      },
    },
  },
  {
    name: "get_upcoming_appointment",
    description:
      "Look up the customer's next upcoming appointment and live grooming status.",
    parametersJsonSchema: { type: "object", properties: {} },
  },
];

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export async function handleCustomerSms(params: {
  businessId: string;
  customerPhone: string;
  messageBody: string;
}): Promise<string> {
  const { businessId, customerPhone, messageBody } = params;

  // Load business context
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: {
      services: { where: { isActive: true } },
      phoneNumber: true,
    },
  });

  if (!business) {
    console.error("[SMS AI] Business not found:", businessId);
    return "";
  }

  const timezone = business.timezone || "America/Los_Angeles";

  // Load conversation history + customer context in parallel
  const [history, customerCtx] = await Promise.all([
    loadConversation(businessId, customerPhone),
    lookupCustomerContext(businessId, customerPhone).catch(() => ({
      found: false,
      normalizedPhone: null,
      customer: null,
      pets: [],
      behaviorLogs: [],
    })),
  ]);

  // Build system prompt
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    timeZone: timezone,
  });

  const customerSection = customerCtx.found
    ? `Customer context:\n${buildCustomerContextSummary(customerCtx)}`
    : "Customer context: New customer — no prior visits on file.";

  const servicesList = business.services
    .map((s) => `- ${s.name}: $${s.price} (${s.duration} min)`)
    .join("\n");

  const systemPrompt = `You are Pip, the AI receptionist for ${business.name}, responding to a customer text message.

Today is ${today}.
${customerSection}

Services:
${servicesList || "No services configured yet."}

RULES — follow these exactly:
- Keep every reply SHORT. Under 160 characters if possible. 2 sentences max unless listing slots.
- Ask only ONE question per reply.
- Never confirm a booking until book_appointment returns booked: true.
- Plain text only — no markdown, bullet points, or emojis.
- Always call check_availability before booking. Never invent slot times.
- Use the customer's pet name whenever you know it.
- If the customer's request is outside your ability (pricing disputes, special medical requests), say: "Please call us at ${business.phone || "the salon"} for that."
- If a customer asks to cancel, always confirm which appointment then call cancel_appointment.
- If you don't have their name yet, ask for it before booking.`;

  // Build Gemini contents array
  const geminiHistory = buildGeminiHistory(history);
  let currentContents: Content[] = [
    ...geminiHistory,
    { role: "user", parts: [{ text: messageBody }] },
  ];

  // Tool-calling loop
  let finalText =
    "Thanks for reaching out! Please call us directly for assistance.";
  const ai = getGemini();
  const model = process.env.GEMINI_MODEL || "gemini-2.5-flash";

  for (let iteration = 0; iteration < MAX_TOOL_ITERATIONS; iteration++) {
    let response;
    try {
      response = await ai.models.generateContent({
        model,
        contents: currentContents,
        config: {
          tools: [{ functionDeclarations: TOOL_DECLARATIONS }],
          systemInstruction: systemPrompt,
          temperature: 0.4,
        },
      });
    } catch (err) {
      console.error("[SMS AI] Gemini generateContent error:", err);
      break;
    }

    const functionCalls = response.functionCalls;

    // No tool call — this is the final text response
    if (!functionCalls || functionCalls.length === 0) {
      finalText = response.text || finalText;
      break;
    }

    // Execute all tool calls and collect results
    const toolResultParts: Part[] = [];

    for (const fc of functionCalls) {
      const args = (fc.args || {}) as Record<string, string>;
      let result: Record<string, unknown> = {
        error: "Unknown tool",
      };

      try {
        if (fc.name === "check_availability") {
          result = await toolCheckAvailability(
            businessId,
            timezone,
            business.services,
            {
              date: args.date || "today",
              service_name: args.service_name || "",
              preferred_time: args.preferred_time,
            }
          );
        } else if (fc.name === "book_appointment") {
          result = await toolBookAppointment(
            businessId,
            customerPhone,
            timezone,
            business.services,
            {
              id: business.id,
              name: business.name,
              ownerName: business.ownerName,
              phone: business.phone,
              phoneNumber: business.phoneNumber,
            },
            {
              customer_name: args.customer_name || "",
              pet_name: args.pet_name || "",
              pet_breed: args.pet_breed,
              pet_size: args.pet_size,
              service_name: args.service_name || "",
              start_time: args.start_time || "",
            }
          );
        } else if (fc.name === "cancel_appointment") {
          result = await toolCancelAppointment(
            businessId,
            customerPhone,
            timezone,
            {
              id: business.id,
              name: business.name,
              ownerName: business.ownerName,
              phone: business.phone,
              phoneNumber: business.phoneNumber,
            },
            {
              appointment_id: args.appointment_id,
              pet_name: args.pet_name,
            }
          );
        } else if (fc.name === "get_upcoming_appointment") {
          result = await toolGetUpcomingAppointment(
            businessId,
            customerPhone,
            timezone
          );
        }
      } catch (err) {
        console.error(`[SMS AI] tool ${fc.name} threw:`, err);
        result = { error: "Tool execution failed. Please try again." };
      }

      toolResultParts.push({
        functionResponse: {
          name: fc.name!,
          response: result,
        },
      } as Part);
    }

    // Append model response + tool results and continue loop
    const modelContent = response.candidates?.[0]?.content;
    if (modelContent) {
      currentContents = [
        ...currentContents,
        modelContent,
        { role: "user", parts: toolResultParts },
      ];
    } else {
      // Shouldn't happen, but break the loop to avoid hanging
      break;
    }
  }

  // Persist conversation history
  const updatedHistory: StoredMessage[] = [
    ...history,
    { role: "user", content: messageBody, ts: Date.now() },
    { role: "assistant", content: finalText, ts: Date.now() },
  ];
  await saveConversation(businessId, customerPhone, updatedHistory);

  return finalText;
}
