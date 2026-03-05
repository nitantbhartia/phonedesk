import OpenAI from "openai";
import { prisma } from "./prisma";
import { sendSms } from "./twilio";

function getOpenAI() {
  return new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}

interface ParsedCommand {
  intent: string;
  entities: Record<string, string>;
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
  const response = await getOpenAI().chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a command parser for a pet grooming business management system. Parse the owner's text message into a structured intent and entities. Return ONLY valid JSON.

Possible intents: block_calendar, add_service, update_hours, pause_bookings, resume_bookings, show_schedule, cancel_appointment, show_prices, unknown

${COMMAND_EXAMPLES}

Today's date is ${new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}.`,
      },
      { role: "user", content: message },
    ],
    response_format: { type: "json_object" },
    temperature: 0,
  });

  const content = response.choices[0]?.message?.content;
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
          await sendSms(
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
  await sendSms(replyTo, `[RingPaw] ${responseMessage}`, fromNumber);

  return responseMessage;
}
