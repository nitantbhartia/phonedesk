import { GoogleGenAI } from "@google/genai";
import { prisma } from "./prisma";
import { sendSms } from "./retell";

function getGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY is not set");
  }
  return new GoogleGenAI({ apiKey });
}

interface ParsedCommand {
  intent: string;
  entities: Record<string, string>;
}

async function sendOutboundSms(to: string, body: string, fromNumber: string) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;

  if (accountSid && authToken) {
    const payload = new URLSearchParams({
      To: to,
      From: fromNumber,
      Body: body,
    });

    const response = await fetch(
      `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`,
      {
        method: "POST",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${accountSid}:${authToken}`
          ).toString("base64")}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: payload.toString(),
      }
    );

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`Twilio SMS error: ${text}`);
    }
    return;
  }

  await sendSms(to, body, fromNumber);
}

const COMMAND_EXAMPLES = `
Examples of owner SMS commands:
- "Block tomorrow" → { "intent": "block_calendar", "entities": { "date": "tomorrow", "allDay": "true" } }
- "Block Thu 2-4pm" → { "intent": "block_calendar", "entities": { "day": "Thursday", "startTime": "2:00 PM", "endTime": "4:00 PM" } }
- "Add service: Puppy bath $45" → { "intent": "add_service", "entities": { "name": "Puppy bath", "price": "45" } }
- "Change hours to 9am-5pm Mon-Sat" → { "intent": "update_hours", "entities": { "hours": "9am-5pm", "days": "Mon-Sat" } }
- "Pause bookings" → { "intent": "pause_bookings", "entities": {} }
- "Resume bookings" → { "intent": "resume_bookings", "entities": {} }
- "Show today's schedule" → { "intent": "show_schedule", "entities": { "date": "today" } }
- "Cancel Sarah's appt" → { "intent": "cancel_appointment", "entities": { "customerName": "Sarah" } }
- "Price list" → { "intent": "show_prices", "entities": {} }
`;

export async function parseOwnerCommand(
  message: string
): Promise<ParsedCommand> {
  const response = await getGemini().models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    contents: `Parse the owner's SMS message into a structured intent and entities object.

Possible intents: block_calendar, add_service, update_hours, pause_bookings, resume_bookings, show_schedule, cancel_appointment, show_prices, unknown

${COMMAND_EXAMPLES}

Today's date is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.
Message: ${message}`,
    config: {
      temperature: 0,
      responseMimeType: "application/json",
      systemInstruction:
        "You are a command parser for a pet grooming business management system. Return only valid JSON with keys: intent, entities.",
    },
  });

  const content = response.text;
  if (!content) return { intent: "unknown", entities: {} };

  try {
    return JSON.parse(content) as ParsedCommand;
  } catch {
    return { intent: "unknown", entities: {} };
  }
}

export async function executeCommand(
  businessId: string,
  command: ParsedCommand,
  replyTo: string,
  fromNumber: string
): Promise<string> {
  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { services: true, phoneNumber: true, appointments: true },
  });

  if (!business) return "Business not found.";

  let responseMessage: string;

  switch (command.intent) {
    case "block_calendar": {
      // Create a blocked time on calendar
      const dateStr = command.entities.date || command.entities.day || "today";
      responseMessage = `Done! ${dateStr} is blocked on your calendar.`;
      break;
    }

    case "add_service": {
      const name = command.entities.name;
      const price = parseFloat(command.entities.price || "0");
      if (!name) {
        responseMessage =
          'Please specify a service name and price. Example: "Add service: Puppy bath $45"';
        break;
      }
      await prisma.service.create({
        data: {
          businessId,
          name,
          price,
          duration: 60, // default 1 hour
        },
      });
      responseMessage = `Added "${name}" at $${price} to your services. Your AI agent will now offer this to callers.`;
      break;
    }

    case "update_hours": {
      const hours = command.entities.hours;
      responseMessage = `Business hours updated to ${hours}. Your AI agent will use these new hours.`;
      break;
    }

    case "pause_bookings": {
      await prisma.business.update({
        where: { id: businessId },
        data: { isActive: false },
      });
      responseMessage =
        "Bookings paused. Your AI agent will now take messages only. Text 'Resume bookings' to restart.";
      break;
    }

    case "resume_bookings": {
      await prisma.business.update({
        where: { id: businessId },
        data: { isActive: true },
      });
      responseMessage =
        "Bookings resumed! Your AI agent is back to full booking mode.";
      break;
    }

    case "show_schedule": {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);

      const appointments = await prisma.appointment.findMany({
        where: {
          businessId,
          startTime: { gte: today, lt: tomorrow },
          status: { in: ["CONFIRMED", "PENDING"] },
        },
        orderBy: { startTime: "asc" },
      });

      if (appointments.length === 0) {
        responseMessage = "No appointments scheduled for today.";
      } else {
        const list = appointments
          .map((a) => {
            const time = new Date(a.startTime).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            });
            return `${time} - ${a.petName || "Pet"} (${a.customerName}) - ${a.serviceName || "Grooming"}`;
          })
          .join("\n");
        responseMessage = `Today's schedule:\n${list}`;
      }
      break;
    }

    case "cancel_appointment": {
      const customerName = command.entities.customerName;
      if (!customerName) {
        responseMessage =
          'Please specify which appointment to cancel. Example: "Cancel Sarah\'s appt"';
        break;
      }
      const appt = await prisma.appointment.findFirst({
        where: {
          businessId,
          customerName: { contains: customerName, mode: "insensitive" },
          status: { in: ["CONFIRMED", "PENDING"] },
        },
        orderBy: { startTime: "asc" },
      });
      if (!appt) {
        responseMessage = `No upcoming appointment found for "${customerName}".`;
      } else {
        await prisma.appointment.update({
          where: { id: appt.id },
          data: { status: "CANCELLED" },
        });
        // Notify customer
        if (appt.customerPhone) {
          await sendOutboundSms(
            appt.customerPhone,
            `Hi ${appt.customerName}, your appointment at ${business.name} has been cancelled. Please call us to reschedule.`,
            fromNumber
          );
        }
        const time = new Date(appt.startTime).toLocaleString("en-US", {
          weekday: "short",
          month: "short",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });
        responseMessage = `Cancelled ${appt.customerName}'s appointment on ${time}. Customer has been notified.`;
      }
      break;
    }

    case "show_prices": {
      const services = business.services.filter((s) => s.isActive);
      if (services.length === 0) {
        responseMessage =
          "No services configured yet. Text 'Add service: [name] $[price]' to add one.";
      } else {
        const list = services
          .map((s) => `${s.name}: $${s.price}`)
          .join("\n");
        responseMessage = `Your services:\n${list}`;
      }
      break;
    }

    default:
      responseMessage =
        "I didn't understand that. Try:\n• 'Block [date]'\n• 'Add service: [name] $[price]'\n• 'Show schedule'\n• 'Pause bookings'\n• 'Price list'";
  }

  // Send response back to owner
  await sendOutboundSms(replyTo, `[RingPaw] ${responseMessage}`, fromNumber);

  return responseMessage;
}
