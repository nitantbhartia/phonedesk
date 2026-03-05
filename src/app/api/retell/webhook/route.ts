import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendBookingNotificationToOwner,
  sendBookingConfirmationToCustomer,
  sendMissedCallNotification,
} from "@/lib/notifications";

// Retell sends webhook events: call_started, call_ended, call_analyzed
// Payload: { event: string, call: { call_id, call_type, agent_id, call_status, from_number, to_number, direction, start_timestamp, end_timestamp, disconnection_reason, transcript, transcript_object, call_analysis, metadata } }

export async function POST(req: NextRequest) {
  const body = await req.json();
  const { event, call } = body;

  if (!event || !call) {
    return NextResponse.json({ ok: true });
  }

  switch (event) {
    case "call_started":
      return handleCallStarted(call);
    case "call_ended":
      return handleCallEnded(call);
    case "call_analyzed":
      return handleCallAnalyzed(call);
    default:
      return NextResponse.json({ ok: true });
  }
}

async function handleCallStarted(call: RetellCallPayload) {
  const calledNumber = call.to_number;

  const phoneNum = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
      })
    : null;

  if (phoneNum) {
    await prisma.call.upsert({
      where: { retellCallId: call.call_id || "" },
      create: {
        businessId: phoneNum.businessId,
        retellCallId: call.call_id,
        callerPhone: call.from_number,
        status: "IN_PROGRESS",
      },
      update: { status: "IN_PROGRESS" },
    });
  }

  return new NextResponse(null, { status: 204 });
}

async function handleCallEnded(call: RetellCallPayload) {
  const calledNumber = call.to_number;

  const phoneNum = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: { include: { phoneNumber: true } } },
      })
    : null;

  if (!phoneNum?.business) return new NextResponse(null, { status: 204 });

  const business = phoneNum.business;

  // Calculate duration from timestamps
  const duration =
    call.start_timestamp && call.end_timestamp
      ? Math.round((call.end_timestamp - call.start_timestamp) / 1000)
      : null;

  // Create or update call record
  const existingCall = call.call_id
    ? await prisma.call.findUnique({
        where: { retellCallId: call.call_id },
      })
    : null;

  const callRecord = existingCall
    ? await prisma.call.update({
        where: { retellCallId: call.call_id },
        data: {
          callerPhone: call.from_number,
          duration,
          transcript: call.transcript || null,
          status: "COMPLETED",
          recordingUrl: call.recording_url || null,
        },
      })
    : await prisma.call.create({
        data: {
          businessId: business.id,
          retellCallId: call.call_id,
          callerPhone: call.from_number,
          duration,
          transcript: call.transcript || null,
          status: "COMPLETED",
          recordingUrl: call.recording_url || null,
        },
      });

  // If no appointment was created during the call, mark as NO_BOOKING
  if (!callRecord.appointmentId) {
    await prisma.call.update({
      where: { id: callRecord.id },
      data: { status: "NO_BOOKING" },
    });

    await sendMissedCallNotification(
      business as Parameters<typeof sendMissedCallNotification>[0],
      call.from_number || "Unknown",
      undefined
    );
  }

  return new NextResponse(null, { status: 204 });
}

async function handleCallAnalyzed(call: RetellCallPayload) {
  if (!call.call_id) return new NextResponse(null, { status: 204 });

  const existingCall = await prisma.call.findUnique({
    where: { retellCallId: call.call_id },
  });

  if (existingCall) {
    const extractedData = call.call_analysis?.custom_analysis_data || {};
    const callerName =
      (extractedData as Record<string, string>).customerName || null;

    await prisma.call.update({
      where: { retellCallId: call.call_id },
      data: {
        summary:
          (call.call_analysis as Record<string, string>)?.call_summary || null,
        callerName,
        extractedData: extractedData as object,
      },
    });
  }

  return new NextResponse(null, { status: 204 });
}

interface RetellCallPayload {
  call_id?: string;
  call_type?: string;
  agent_id?: string;
  call_status?: string;
  from_number?: string;
  to_number?: string;
  direction?: string;
  start_timestamp?: number;
  end_timestamp?: number;
  disconnection_reason?: string;
  transcript?: string;
  transcript_object?: unknown[];
  recording_url?: string;
  call_analysis?: {
    custom_analysis_data?: Record<string, unknown>;
    call_summary?: string;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
}
