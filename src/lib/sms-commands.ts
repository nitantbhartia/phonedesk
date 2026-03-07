import { GoogleGenAI } from "@google/genai";
import { prisma } from "./prisma";
import { sendSms } from "./sms";

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
- "Checked in Buddy" → { "intent": "check_in", "entities": { "petName": "Buddy" } }
- "Start Buddy" → { "intent": "start_grooming", "entities": { "petName": "Buddy" } }
- "Done Buddy" → { "intent": "finish_grooming", "entities": { "petName": "Buddy" } }
- "Note Buddy: anxious today, needed muzzle for nails" → { "intent": "behavior_note", "entities": { "petName": "Buddy", "note": "anxious today, needed muzzle for nails" } }
`;

export async function parseOwnerCommand(
  message: string
): Promise<ParsedCommand> {
  const response = await getGemini().models.generateContent({
    model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
    contents: `Parse the owner's SMS message into a structured intent and entities object.

Possible intents: block_calendar, add_service, update_hours, pause_bookings, resume_bookings, show_schedule, cancel_appointment, show_prices, check_in, start_grooming, finish_grooming, behavior_note, unknown

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

function getTodayBoundsInTimezone(timezone: string): { start: Date; end: Date } {
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  return {
    start: new Date(`${todayStr}T00:00:00`),
    end: new Date(`${todayStr}T23:59:59`),
  };
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
      const dateStr = command.entities.date || command.entities.day || "today";
      const isAllDay = command.entities.allDay === "true" || (!command.entities.startTime && !command.entities.endTime);
      const timezone = business.timezone || "America/Los_Angeles";

      // Resolve relative date strings
      const now = new Date();
      let targetDate: Date;
      if (dateStr === "today") {
        targetDate = now;
      } else if (dateStr === "tomorrow") {
        targetDate = new Date(now.getTime() + 86400000);
      } else {
        // Try to parse day name (e.g. "Thursday") as next occurrence
        const dayNames = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const dayIdx = dayNames.indexOf(dateStr.toLowerCase());
        if (dayIdx >= 0) {
          targetDate = new Date(now);
          const diff = (dayIdx - now.getDay() + 7) % 7 || 7;
          targetDate.setDate(now.getDate() + diff);
        } else {
          targetDate = new Date(dateStr);
          if (isNaN(targetDate.getTime())) targetDate = now;
        }
      }

      const dateKey = targetDate.toISOString().slice(0, 10);
      let blockStart: Date;
      let blockEnd: Date;

      if (isAllDay) {
        blockStart = new Date(`${dateKey}T00:00:00`);
        blockEnd = new Date(`${dateKey}T23:59:59`);
      } else {
        // Parse start/end times like "2:00 PM", "14:00"
        const parseTime = (t: string): string => {
          const match = t.match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
          if (!match) return "09:00";
          let h = parseInt(match[1]);
          const m = match[2] || "00";
          const period = match[3]?.toLowerCase();
          if (period === "pm" && h < 12) h += 12;
          if (period === "am" && h === 12) h = 0;
          return `${h.toString().padStart(2, "0")}:${m}`;
        };
        const st = parseTime(command.entities.startTime || "09:00");
        const et = parseTime(command.entities.endTime || "17:00");
        blockStart = new Date(`${dateKey}T${st}:00`);
        blockEnd = new Date(`${dateKey}T${et}:00`);
      }

      // Create a blocking appointment so getAvailableSlots sees the time as busy
      await prisma.appointment.create({
        data: {
          businessId,
          customerName: "BLOCKED",
          petName: "Blocked Time",
          serviceName: "Owner Block",
          startTime: blockStart,
          endTime: blockEnd,
          status: "CONFIRMED",
          notes: `Blocked via SMS: ${dateStr}`,
        },
      });

      const label = isAllDay ? `all day on ${dateKey}` : `${command.entities.startTime}-${command.entities.endTime} on ${dateKey}`;
      responseMessage = `Done! Blocked ${label} on your calendar. No appointments will be booked during this time.`;
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
      const hoursStr = command.entities.hours; // e.g. "9am-5pm"
      const daysStr = command.entities.days;   // e.g. "Mon-Sat"

      if (!hoursStr) {
        responseMessage = 'Please specify hours. Example: "Change hours to 9am-5pm Mon-Sat"';
        break;
      }

      // Parse hours like "9am-5pm" or "09:00-17:00"
      const parseHour = (t: string): string => {
        const match = t.trim().match(/(\d{1,2}):?(\d{2})?\s*(am|pm)?/i);
        if (!match) return t;
        let h = parseInt(match[1]);
        const m = match[2] || "00";
        const period = match[3]?.toLowerCase();
        if (period === "pm" && h < 12) h += 12;
        if (period === "am" && h === 12) h = 0;
        return `${h.toString().padStart(2, "0")}:${m}`;
      };

      const [openStr, closeStr] = hoursStr.split("-").map((s: string) => s.trim());
      const open = parseHour(openStr || "09:00");
      const close = parseHour(closeStr || "17:00");

      // Parse days like "Mon-Sat", "Mon-Fri", or default to all days
      const allDays = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];
      let targetDays: string[];

      if (daysStr) {
        const dayMap: Record<string, string> = {
          mon: "mon", tue: "tue", wed: "wed", thu: "thu", fri: "fri", sat: "sat", sun: "sun",
          monday: "mon", tuesday: "tue", wednesday: "wed", thursday: "thu",
          friday: "fri", saturday: "sat", sunday: "sun",
        };

        if (daysStr.includes("-")) {
          const [startDay, endDay] = daysStr.split("-").map((d: string) => dayMap[d.trim().toLowerCase()] || d.trim().toLowerCase());
          const startIdx = allDays.indexOf(startDay);
          const endIdx = allDays.indexOf(endDay);
          if (startIdx >= 0 && endIdx >= 0) {
            targetDays = startIdx <= endIdx
              ? allDays.slice(startIdx, endIdx + 1)
              : [...allDays.slice(startIdx), ...allDays.slice(0, endIdx + 1)];
          } else {
            targetDays = allDays;
          }
        } else {
          targetDays = daysStr.split(/[,\s]+/).map((d: string) => dayMap[d.trim().toLowerCase()] || d.trim().toLowerCase()).filter((d: string) => allDays.includes(d));
          if (targetDays.length === 0) targetDays = allDays;
        }
      } else {
        targetDays = allDays;
      }

      // Merge with existing hours
      const currentHours = (business.businessHours as Record<string, { open: string; close: string }>) || {};
      const updatedHours = { ...currentHours };
      for (const day of targetDays) {
        updatedHours[day] = { open, close };
      }

      await prisma.business.update({
        where: { id: businessId },
        data: { businessHours: updatedHours },
      });

      responseMessage = `Business hours updated to ${openStr}-${closeStr} for ${targetDays.join(", ")}. Your AI agent will use these new hours.`;
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
      const timezone = business.timezone || "America/Los_Angeles";
      const dateStr = command.entities.date || "today";

      // Resolve date relative to business timezone
      let targetDate: string;
      if (dateStr === "today") {
        targetDate = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
      } else if (dateStr === "tomorrow") {
        const tom = new Date();
        tom.setDate(tom.getDate() + 1);
        targetDate = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(tom);
      } else {
        // Try parsing as a date
        const parsed = new Date(dateStr);
        targetDate = isNaN(parsed.getTime())
          ? new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date())
          : new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(parsed);
      }

      // Build day boundaries in business timezone
      const dayStart = new Date(`${targetDate}T00:00:00`);
      const dayEnd = new Date(`${targetDate}T23:59:59`);

      const appointments = await prisma.appointment.findMany({
        where: {
          businessId,
          startTime: { gte: dayStart, lt: dayEnd },
          status: { in: ["CONFIRMED", "PENDING"] },
        },
        orderBy: { startTime: "asc" },
      });

      const dateLabel = dateStr === "today" ? "Today" : dateStr === "tomorrow" ? "Tomorrow" : targetDate;

      if (appointments.length === 0) {
        responseMessage = `No appointments scheduled for ${dateLabel.toLowerCase()}.`;
      } else {
        const list = appointments
          .map((a) => {
            const time = new Date(a.startTime).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
              timeZone: timezone,
            });
            return `${time} - ${a.petName || "Pet"} (${a.customerName}) - ${a.serviceName || "Grooming"}`;
          })
          .join("\n");
        responseMessage = `${dateLabel}'s schedule:\n${list}`;
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

    case "check_in": {
      const petName = command.entities.petName;
      if (!petName) {
        responseMessage = "Please specify the pet name. Example: \"Checked in Buddy\"";
        break;
      }
      const { start: todayStart, end: todayEnd } = getTodayBoundsInTimezone(business.timezone || "America/Los_Angeles");

      const checkInAppt = await prisma.appointment.findFirst({
        where: {
          businessId,
          petName: { contains: petName, mode: "insensitive" },
          startTime: { gte: todayStart, lte: todayEnd },
          status: { in: ["CONFIRMED", "PENDING"] },
        },
        orderBy: { startTime: "asc" },
      });

      if (!checkInAppt) {
        responseMessage = `No appointment found today for "${petName}".`;
      } else {
        await prisma.appointment.update({
          where: { id: checkInAppt.id },
          data: {
            groomingStatus: "CHECKED_IN",
            groomingStatusAt: new Date(),
          },
        });
        // Notify customer
        if (checkInAppt.customerPhone && business.phoneNumber?.number) {
          await sendSms(
            checkInAppt.customerPhone,
            `${checkInAppt.petName || petName} is checked in at ${business.name}! We'll text you when they're ready.`,
            business.phoneNumber.number
          );
        }
        responseMessage = `${checkInAppt.petName || petName} is checked in. Customer has been notified.`;
      }
      break;
    }

    case "start_grooming": {
      const petName = command.entities.petName;
      if (!petName) {
        responseMessage = "Please specify the pet name. Example: \"Start Buddy\"";
        break;
      }
      const { start: todayStart, end: todayEnd } = getTodayBoundsInTimezone(business.timezone || "America/Los_Angeles");

      const startAppt = await prisma.appointment.findFirst({
        where: {
          businessId,
          petName: { contains: petName, mode: "insensitive" },
          startTime: { gte: todayStart, lte: todayEnd },
          status: { in: ["CONFIRMED", "PENDING"] },
        },
        orderBy: { startTime: "asc" },
      });

      if (!startAppt) {
        responseMessage = `No appointment found today for "${petName}".`;
      } else {
        await prisma.appointment.update({
          where: { id: startAppt.id },
          data: {
            groomingStatus: "IN_PROGRESS",
            groomingStatusAt: new Date(),
          },
        });
        // Notify customer
        if (startAppt.customerPhone && business.phoneNumber?.number) {
          await sendSms(
            startAppt.customerPhone,
            `${startAppt.petName || petName} is in the chair! We'll text you when they're ready for pickup.`,
            business.phoneNumber.number
          );
        }
        responseMessage = `${startAppt.petName || petName} is now being groomed. Customer has been notified.`;
      }
      break;
    }

    case "behavior_note": {
      const petName = command.entities.petName;
      const noteText = command.entities.note;
      if (!petName || !noteText) {
        responseMessage = 'Please specify pet and note. Example: "Note Buddy: anxious today, needed muzzle"';
        break;
      }

      // Auto-detect severity from keywords
      const lowerNote = noteText.toLowerCase();
      const severity = (lowerNote.includes("bite") || lowerNote.includes("aggressive") || lowerNote.includes("attack"))
        ? "HIGH_RISK"
        : (lowerNote.includes("anxious") || lowerNote.includes("muzzle") || lowerNote.includes("nervous") || lowerNote.includes("caution") || lowerNote.includes("snap"))
          ? "CAUTION"
          : "NOTE";

      // Auto-detect tags
      const tags: string[] = [];
      if (lowerNote.includes("muzzle")) tags.push("muzzle_required");
      if (lowerNote.includes("anxious") || lowerNote.includes("anxiety")) tags.push("anxious");
      if (lowerNote.includes("bite") || lowerNote.includes("biting")) tags.push("biting");
      if (lowerNote.includes("aggressive")) tags.push("aggressive");
      if (lowerNote.includes("nervous")) tags.push("nervous");
      if (lowerNote.includes("pull") || lowerNote.includes("pulling")) tags.push("pulling");

      // Try to link to today's appointment and customer/pet records
      const { start: noteStart, end: noteEnd } = getTodayBoundsInTimezone(business.timezone || "America/Los_Angeles");

      const noteAppt = await prisma.appointment.findFirst({
        where: {
          businessId,
          petName: { contains: petName, mode: "insensitive" },
          startTime: { gte: noteStart, lte: noteEnd },
        },
        orderBy: { startTime: "asc" },
      });

      let customerId: string | null = null;
      let petId: string | null = null;

      if (noteAppt?.customerPhone) {
        const customer = await prisma.customer.findFirst({
          where: { businessId, phone: noteAppt.customerPhone },
          include: { pets: true },
        });
        if (customer) {
          customerId = customer.id;
          const petRecord = customer.pets.find(
            (p) => p.name.toLowerCase() === petName.toLowerCase()
          );
          if (petRecord) petId = petRecord.id;
        }
      }

      await prisma.behaviorLog.create({
        data: {
          businessId,
          petName,
          customerId,
          petId,
          appointmentId: noteAppt?.id || null,
          severity,
          note: noteText,
          tags,
        },
      });

      const severityLabel = severity === "HIGH_RISK" ? " (flagged HIGH RISK)" : severity === "CAUTION" ? " (flagged CAUTION)" : "";
      responseMessage = `Behavior note logged for ${petName}${severityLabel}. This will appear in pre-appointment briefs.`;
      break;
    }

    case "finish_grooming": {
      const petName = command.entities.petName;
      if (!petName) {
        responseMessage = "Please specify the pet name. Example: \"Done Buddy\"";
        break;
      }
      const { start: todayStart, end: todayEnd } = getTodayBoundsInTimezone(business.timezone || "America/Los_Angeles");

      const doneAppt = await prisma.appointment.findFirst({
        where: {
          businessId,
          petName: { contains: petName, mode: "insensitive" },
          startTime: { gte: todayStart, lte: todayEnd },
          status: { in: ["CONFIRMED", "PENDING"] },
        },
        orderBy: { startTime: "asc" },
      });

      if (!doneAppt) {
        responseMessage = `No appointment found today for "${petName}".`;
      } else {
        await prisma.appointment.update({
          where: { id: doneAppt.id },
          data: {
            groomingStatus: "READY_FOR_PICKUP",
            groomingStatusAt: new Date(),
            pickupNotifiedAt: new Date(),
          },
        });
        // Notify customer with pickup address
        if (doneAppt.customerPhone && business.phoneNumber?.number) {
          await sendSms(
            doneAppt.customerPhone,
            `${doneAppt.petName || petName} is all done and looking fabulous! Head to ${business.address || business.name} for pickup.`,
            business.phoneNumber.number
          );
        }
        responseMessage = `${doneAppt.petName || petName} is ready for pickup. Customer has been notified.`;
      }
      break;
    }

    default:
      responseMessage =
        "I didn't understand that. Try:\n• 'Block [date]'\n• 'Add service: [name] $[price]'\n• 'Show schedule'\n• 'Pause bookings'\n• 'Price list'\n• 'Checked in [pet]'\n• 'Start [pet]'\n• 'Done [pet]'\n• 'Note [pet]: [behavior note]'";
  }

  // Send response back to owner
  await sendOutboundSms(replyTo, `[RingPaw] ${responseMessage}`, fromNumber);

  return responseMessage;
}
