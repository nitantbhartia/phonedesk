import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAvailableSlots, bookAppointment } from "@/lib/calendar";
import {
  sendBookingNotificationToOwner,
  sendBookingConfirmationToCustomer,
  sendMissedCallNotification,
} from "@/lib/notifications";

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { message } = body;

  // Vapi sends different message types
  switch (message?.type) {
    case "function-call":
      return handleFunctionCall(body);
    case "end-of-call-report":
      return handleEndOfCall(body);
    case "status-update":
      return handleStatusUpdate(body);
    default:
      return NextResponse.json({ ok: true });
  }
}

async function handleFunctionCall(body: Record<string, unknown>) {
  const message = body.message as {
    functionCall?: { name: string; parameters: Record<string, string> };
    call?: { phoneNumber?: { number: string } };
  };
  const functionCall = message?.functionCall;

  if (!functionCall) return NextResponse.json({ ok: true });

  const { name, parameters } = functionCall;

  // Identify business from the called number
  const calledNumber = message?.call?.phoneNumber?.number;
  const phoneNum = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: { include: { services: true } } },
      })
    : null;

  if (!phoneNum?.business) {
    return NextResponse.json({
      result: "I apologize, but I'm having trouble accessing the system right now. Let me take your information and have someone call you back.",
    });
  }

  const business = phoneNum.business;

  switch (name) {
    case "checkAvailability": {
      const { date, serviceName } = parameters;
      const requestedDate = date ? new Date(date) : new Date();

      // Find service duration
      const service = business.services.find(
        (s) =>
          s.isActive &&
          s.name.toLowerCase().includes((serviceName || "").toLowerCase())
      );
      const duration = service?.duration || 60;

      try {
        const slots = await getAvailableSlots(
          business.id,
          requestedDate,
          duration
        );

        if (slots.length === 0) {
          return NextResponse.json({
            result: `I don't have any openings on ${requestedDate.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}. Would you like to try a different day?`,
          });
        }

        // Offer first 2-3 slots
        const offered = slots.slice(0, 3);
        const slotDescriptions = offered
          .map((s) =>
            new Date(s.start).toLocaleTimeString("en-US", {
              hour: "numeric",
              minute: "2-digit",
            })
          )
          .join(", or ");

        return NextResponse.json({
          result: `I have openings at ${slotDescriptions}. Which time works best for you?`,
          availableSlots: offered,
        });
      } catch (error) {
        console.error("Error checking availability:", error);
        return NextResponse.json({
          result: "Let me check with the owner on availability. What day and time would work best for you?",
        });
      }
    }

    case "bookAppointment": {
      const {
        customerName,
        customerPhone,
        petName,
        petBreed,
        petSize,
        serviceName: svcName,
        startTime,
      } = parameters;

      const service = business.services.find(
        (s) =>
          s.isActive &&
          s.name.toLowerCase().includes((svcName || "").toLowerCase())
      );

      const start = new Date(startTime);
      const end = new Date(start.getTime() + (service?.duration || 60) * 60000);

      try {
        const appointment = await bookAppointment(business.id, {
          customerName,
          customerPhone,
          petName,
          petBreed,
          petSize: petSize as "SMALL" | "MEDIUM" | "LARGE" | "XLARGE",
          serviceName: service?.name || svcName,
          servicePrice: service?.price,
          startTime: start,
          endTime: end,
        });

        // Send notifications
        const fullBusiness = await prisma.business.findUnique({
          where: { id: business.id },
          include: { phoneNumber: true },
        });

        if (fullBusiness) {
          await Promise.allSettled([
            sendBookingNotificationToOwner(
              fullBusiness as Parameters<typeof sendBookingNotificationToOwner>[0],
              appointment
            ),
            sendBookingConfirmationToCustomer(
              fullBusiness as Parameters<typeof sendBookingConfirmationToCustomer>[0],
              appointment
            ),
          ]);
        }

        const timeStr = start.toLocaleString("en-US", {
          weekday: "long",
          month: "long",
          day: "numeric",
          hour: "numeric",
          minute: "2-digit",
        });

        return NextResponse.json({
          result: `I've booked ${petName || "your pet"} for a ${service?.name || svcName || "grooming"} appointment on ${timeStr}. You'll receive a confirmation text shortly.`,
          appointmentId: appointment.id,
        });
      } catch (error) {
        console.error("Error booking appointment:", error);
        return NextResponse.json({
          result: "I wasn't able to complete the booking just now. Let me have the owner call you back to confirm.",
        });
      }
    }

    default:
      return NextResponse.json({
        result: "I'll pass that along to the owner.",
      });
  }
}

async function handleEndOfCall(body: Record<string, unknown>) {
  const message = body.message as {
    call?: {
      id: string;
      phoneNumber?: { number: string };
      customer?: { number: string };
    };
    transcript?: string;
    summary?: string;
    recordingUrl?: string;
    duration?: number;
    endedReason?: string;
    analysis?: {
      structuredData?: Record<string, unknown>;
    };
  };

  const callData = message?.call;
  const calledNumber = callData?.phoneNumber?.number;

  const phoneNum = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: { include: { phoneNumber: true } } },
      })
    : null;

  if (!phoneNum?.business) return NextResponse.json({ ok: true });

  const business = phoneNum.business;
  const extractedData = message?.analysis?.structuredData || {};

  // Create call record
  const call = await prisma.call.create({
    data: {
      businessId: business.id,
      vapiCallId: callData?.id,
      callerPhone: callData?.customer?.number,
      callerName:
        (extractedData as Record<string, string>).customerName || null,
      duration: message?.duration || null,
      transcript: message?.transcript || null,
      summary: message?.summary || null,
      status: "COMPLETED",
      extractedData: extractedData as object,
      recordingUrl: message?.recordingUrl || null,
    },
  });

  // If no appointment was created during the call, notify owner of missed booking
  if (!call.appointmentId) {
    await prisma.call.update({
      where: { id: call.id },
      data: { status: "NO_BOOKING" },
    });

    await sendMissedCallNotification(
      business as Parameters<typeof sendMissedCallNotification>[0],
      callData?.customer?.number || "Unknown",
      (extractedData as Record<string, string>).customerName
    );
  }

  return NextResponse.json({ ok: true });
}

async function handleStatusUpdate(body: Record<string, unknown>) {
  const message = body.message as {
    status?: string;
    call?: { id: string; phoneNumber?: { number: string } };
  };

  if (message?.status === "in-progress") {
    const calledNumber = message?.call?.phoneNumber?.number;
    const phoneNum = calledNumber
      ? await prisma.phoneNumber.findFirst({
          where: { number: calledNumber },
        })
      : null;

    if (phoneNum) {
      // Create in-progress call record
      await prisma.call.upsert({
        where: { vapiCallId: message.call?.id || "" },
        create: {
          businessId: phoneNum.businessId,
          vapiCallId: message.call?.id,
          status: "IN_PROGRESS",
        },
        update: { status: "IN_PROGRESS" },
      });
    }
  }

  return NextResponse.json({ ok: true });
}
