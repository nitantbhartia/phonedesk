import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendMissedCallNotification,
} from "@/lib/notifications";
import { normalizePhoneNumber } from "@/lib/phone";
import { upsertCustomerMemoryFromCall, lookupCustomerContext } from "@/lib/customer-memory";
import { refreshRetellLLMForCall } from "@/lib/retell";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { resolveBusinessFromDemo } from "@/lib/demo-session";

// Retell sends webhook events: call_started, call_ended, call_analyzed
// Payload: { event: string, call: { call_id, call_type, agent_id, call_status, from_number, to_number, direction, start_timestamp, end_timestamp, disconnection_reason, transcript, transcript_object, call_analysis, metadata } }

export async function POST(req: NextRequest) {
  const rawBody = await req.text();
  const signature = req.headers.get("x-retell-signature") || "";

  if (!isRetellWebhookValid(rawBody, signature, req.headers)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { event?: string; call?: RetellCallPayload };
  try {
    body = JSON.parse(rawBody);
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { event, call } = body;

  if (!event || !call) {
    return NextResponse.json({ ok: true });
  }

  try {
    switch (event) {
      case "call_started":
        return await handleCallStarted(call);
      case "call_ended":
        return await handleCallEnded(call);
      case "call_analyzed":
        return await handleCallAnalyzed(call);
      default:
        return NextResponse.json({ ok: true });
    }
  } catch (err) {
    console.error("[webhook] Unhandled error processing event:", event, err);
    // Return 204 so Retell doesn't retry — the event was received
    return new NextResponse(null, { status: 204 });
  }
}

async function handleCallStarted(call: RetellCallPayload) {
  if (!call.call_id) {
    return new NextResponse(null, { status: 204 });
  }

  try {
    const calledNumber = normalizePhoneNumber(call.to_number);

    let phoneNum = calledNumber
      ? await prisma.phoneNumber.findFirst({
          where: { number: calledNumber },
          include: { business: { include: { retellConfig: true } } },
        })
      : null;

    // Demo number fallback
    if (!phoneNum && calledNumber) {
      const demoBusinessId = await resolveBusinessFromDemo(calledNumber);
      if (demoBusinessId) {
        const demoBusiness = await prisma.business.findUnique({
          where: { id: demoBusinessId },
          include: { retellConfig: true },
        });
        if (demoBusiness) {
          phoneNum = { businessId: demoBusinessId, business: demoBusiness } as unknown as typeof phoneNum;
        }
      }
    }

    if (phoneNum) {
      // Look up known customer by phone number to pre-fill callerName
      const customerContext = await lookupCustomerContext(
        phoneNum.businessId,
        call.from_number
      );
      const knownName = customerContext.customer?.name || null;

      // Mark as test call if the business hasn't completed onboarding yet
      const business = await prisma.business.findUnique({
        where: { id: phoneNum.businessId },
        select: { onboardingComplete: true },
      });
      const isTestCall = !(business?.onboardingComplete ?? true);

      await prisma.call.upsert({
        where: { retellCallId: call.call_id },
        create: {
          businessId: phoneNum.businessId,
          retellCallId: call.call_id,
          callerPhone: call.from_number,
          callerName: knownName,
          status: "IN_PROGRESS",
          isTestCall,
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
  } catch (err) {
    console.error("[webhook] handleCallStarted DB error:", err);
  }

  return new NextResponse(null, { status: 204 });
}

async function handleCallEnded(call: RetellCallPayload) {
  try {
    const calledNumber = normalizePhoneNumber(call.to_number);

    let phoneNum = calledNumber
      ? await prisma.phoneNumber.findFirst({
          where: { number: calledNumber },
          include: { business: { include: { phoneNumber: true } } },
        })
      : null;

    // Demo number fallback
    if (!phoneNum && calledNumber) {
      const demoBusinessId = await resolveBusinessFromDemo(calledNumber);
      if (demoBusinessId) {
        const demoBusiness = await prisma.business.findUnique({
          where: { id: demoBusinessId },
          include: { phoneNumber: true },
        });
        if (demoBusiness) {
          phoneNum = { businessId: demoBusinessId, business: demoBusiness } as unknown as typeof phoneNum;
        }
      }
    }

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

    if (existingCall) {
      await prisma.call.update({
        where: { retellCallId: call.call_id },
        data: {
          callerPhone: call.from_number,
          duration,
          transcript: call.transcript || null,
          status: "COMPLETED",
          recordingUrl: call.recording_url || null,
        },
      });
    } else {
      await prisma.call.create({
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
    }
  } catch (err) {
    console.error("[webhook] handleCallEnded DB error:", err);
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

    const refreshedCall = await prisma.call.findUnique({
      where: { retellCallId: call.call_id },
      include: { business: { include: { phoneNumber: true } } },
    });

    if (
      refreshedCall &&
      !refreshedCall.appointmentId &&
      refreshedCall.status !== "NO_BOOKING"
    ) {
      await prisma.call.update({
        where: { id: refreshedCall.id },
        data: { status: "NO_BOOKING" },
      });

      await sendMissedCallNotification(
        refreshedCall.business as Parameters<
          typeof sendMissedCallNotification
        >[0],
        call.from_number || refreshedCall.callerPhone || "Unknown",
        refreshedCall.callerName || undefined
      );
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
