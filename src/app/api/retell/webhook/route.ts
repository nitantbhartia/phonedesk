import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendBookingNotificationToOwner,
  sendBookingConfirmationToCustomer,
  sendMissedCallNotification,
} from "@/lib/notifications";
import { normalizePhoneNumber } from "@/lib/phone";
import { upsertCustomerMemoryFromCall, lookupCustomerContext } from "@/lib/customer-memory";
import { refreshRetellLLMForCall } from "@/lib/retell";

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
        include: { business: { include: { retellConfig: true } } },
      })
    : null;

  if (phoneNum) {
    // Look up known customer by phone number to pre-fill callerName
    const customerContext = await lookupCustomerContext(
      phoneNum.businessId,
      call.from_number
    );
    const knownName = customerContext.customer?.name || null;

    await prisma.call.upsert({
      where: { retellCallId: call.call_id || "" },
      create: {
        businessId: phoneNum.businessId,
        retellCallId: call.call_id,
        callerPhone: call.from_number,
        callerName: knownName,
        status: "IN_PROGRESS",
      },
      update: { status: "IN_PROGRESS", callerName: knownName },
    });

    // Refresh date on the LLM. Customer context is not injected here to
    // avoid a race condition when two calls arrive simultaneously for the
    // same business (global LLM vars are shared across all calls). The
    // lookup_customer_context tool fetches context per-call reliably.
    const llmId = (phoneNum.business as { retellConfig?: { llmId?: string } | null })?.retellConfig?.llmId;
    if (llmId) {
      const biz = phoneNum.business as { timezone?: string | null; retellConfig?: { llmId?: string } | null };
      try {
        await refreshRetellLLMForCall(llmId, biz.timezone || undefined);
      } catch (err) {
        console.error("[webhook] Failed to refresh LLM date:", err);
      }
    }
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

  // Calculate duration - Retell provides duration_ms or we compute from timestamps
  const duration = call.duration_ms
    ? Math.round(call.duration_ms / 1000)
    : call.start_timestamp && call.end_timestamp
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
    const extracted = extractedData as Record<string, string>;
    const extractedName = extracted.customerName || extracted.customer_name || null;
    // Prefer AI-extracted name, fall back to the name we pre-filled at call_started
    const callerName = extractedName || existingCall.callerName || null;
    const summary =
      (call.call_analysis as Record<string, string>)?.call_summary || null;

    await prisma.call.update({
      where: { retellCallId: call.call_id },
      data: {
        summary,
        callerName,
        extractedData: extractedData as object,
      },
    });

    if (callerName) {
      await upsertCustomerMemoryFromCall({
        businessId: existingCall.businessId,
        customerName: callerName,
        customerPhone:
          normalizePhoneNumber(call.from_number) || existingCall.callerPhone,
        petName:
          extracted.petName ||
          extracted.pet_name ||
          extracted.dogName ||
          extracted.dog_name ||
          null,
        petBreed:
          extracted.petBreed ||
          extracted.pet_breed ||
          extracted.dogBreed ||
          extracted.dog_breed ||
          null,
        petSize:
          (extracted.petSize ||
            extracted.pet_size ||
            extracted.dogSize ||
            extracted.dog_size ||
            null) as "SMALL" | "MEDIUM" | "LARGE" | "XLARGE" | null,
        serviceName: extracted.serviceName || extracted.service_name || null,
        summary,
        notes:
          extracted.notes ||
          extracted.specialNotes ||
          extracted.special_handling_notes ||
          null,
        outcome: existingCall.appointmentId ? "BOOKED" : "NO_BOOKING",
        contactedAt: new Date(),
      });
    }
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
  duration_ms?: number;
  disconnection_reason?: string;
  transcript?: string;
  transcript_object?: unknown[];
  recording_url?: string;
  call_analysis?: {
    custom_analysis_data?: Record<string, unknown>;
    call_summary?: string;
    user_sentiment?: string;
    call_successful?: boolean;
    [key: string]: unknown;
  };
  metadata?: Record<string, unknown>;
  retell_llm_dynamic_variables?: Record<string, string>;
  collected_dynamic_variables?: Record<string, string>;
}
