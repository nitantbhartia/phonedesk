import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  sendMissedCallNotification,
} from "@/lib/notifications";
import { normalizePhoneNumber } from "@/lib/phone";
import { upsertCustomerMemoryFromCall, lookupCustomerContext } from "@/lib/customer-memory";
import { refreshRetellLLMForCall, endRetellCall, updateRetellPhoneNumber } from "@/lib/retell";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { resolveBusinessFromDemo, resolveDemoSession } from "@/lib/demo-session";

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
    const isOutbound = call.direction === "outbound";

    // For outbound calls, from_number is OUR number and to_number is the customer.
    // For inbound calls, to_number is OUR number and from_number is the customer.
    const ourNumber = normalizePhoneNumber(isOutbound ? call.from_number : call.to_number);
    const calledNumber = ourNumber; // keep variable name for inbound-compat code below
    const normalizedCaller = normalizePhoneNumber(isOutbound ? call.to_number : call.from_number);

    // Outbound calls: resolve business from our number and update the pre-created Call record.
    if (isOutbound) {
      const phoneNum = ourNumber
        ? await prisma.phoneNumber.findFirst({
            where: { number: ourNumber },
            select: { businessId: true },
          })
        : null;
      if (phoneNum && call.call_id) {
        await prisma.call.upsert({
          where: { retellCallId: call.call_id },
          create: {
            businessId: phoneNum.businessId,
            retellCallId: call.call_id,
            callerPhone: normalizedCaller || call.to_number,
            status: "IN_PROGRESS",
            isOutbound: true,
          },
          update: { status: "IN_PROGRESS" },
        });
      }
      return new NextResponse(null, { status: 204 });
    }

    const demoResolution = calledNumber
      ? await resolveDemoSession(calledNumber, call.from_number ?? undefined)
      : null;

    let phoneNum = calledNumber
      ? await prisma.phoneNumber.findFirst({
          where: { number: calledNumber },
          include: { business: { include: { retellConfig: true } } },
        })
      : null;

    // Demo number fallback — only for active (non-expired) sessions
    if (!phoneNum && demoResolution && !demoResolution.expired) {
      if (demoResolution.businessId) {
        const demoBusiness = await prisma.business.findUnique({
          where: { id: demoResolution.businessId },
          include: { retellConfig: true },
        });
        if (demoBusiness) {
          phoneNum = { businessId: demoResolution.businessId, business: demoBusiness } as unknown as typeof phoneNum;
        }
      }
    }

    // Demo number with no active session (or only a grace-period match) — reject immediately to avoid cost
    if (!phoneNum && calledNumber && call.call_id) {
      const isDemoNumber = await prisma.demoNumber.findUnique({
        where: { number: calledNumber },
        select: { id: true, retellPhoneNumber: true },
      });
      if (isDemoNumber) {
        // End the current call
        await endRetellCall(call.call_id).catch((e) => {
          console.error("[webhook] Failed to end sessionless demo call:", e);
        });
        // Clear the inbound agent so future calls don't connect at all until a new session starts
        if (isDemoNumber.retellPhoneNumber) {
          await updateRetellPhoneNumber(isDemoNumber.retellPhoneNumber, { inboundAgentId: null }).catch((e) => {
            console.error("[webhook] Failed to clear inboundAgentId for sessionless demo number:", e);
          });
        }
        return new NextResponse(null, { status: 204 });
      }
    }

    // Public demo phone-number rate limit: detect repeat callers by phone
    if (demoResolution?.source === "public" && normalizedCaller && call.call_id) {
      const now = new Date();

      // Always record the caller's phone on the current attempt first, so the
      // status/stream endpoints can detect the call regardless of rate limiting.
      if (!demoResolution.callerPhone) {
        await prisma.publicDemoAttempt.update({
          where: { id: demoResolution.publicAttemptId },
          data: { callerPhone: normalizedCaller },
        });
        if (demoResolution.leadId) {
          const cooldownUntil = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);
          await prisma.demoLead.update({
            where: { id: demoResolution.leadId },
            data: { cooldownUntil },
          }).catch((e) => {
            console.error("[webhook] Failed to set demo lead cooldown:", e);
          });
        }
      }

      // Check if this phone has already completed a real demo call (duration > 30s)
      // within the rate-limit window.  Calls blocked by the subscription gate or
      // ended immediately don't count — the caller deserves a real attempt.
      // Check both the current session AND previous sessions.
      const windowStart = new Date(now.getTime() - 3 * 24 * 60 * 60 * 1000);
      const demoBizId = process.env.DEMO_BUSINESS_ID;
      if (demoBizId) {
        const previousCall = await prisma.call.findFirst({
          where: {
            businessId: demoBizId,
            callerPhone: normalizedCaller,
            createdAt: { gte: windowStart },
            duration: { gt: 30 },
          },
        });
        if (previousCall) {
          try {
            await endRetellCall(call.call_id);
            // Call was successfully ended — skip creating a call record
            return new NextResponse(null, { status: 204 });
          } catch (e) {
            // If end fails (e.g. call already finished), let it proceed so the
            // call record is created with isTestCall=true and the browser can detect the call.
            console.warn("[webhook] Could not end repeat demo call, allowing it to proceed:", e);
          }
        }
      }
    }

    if (phoneNum) {
      const knownName = demoResolution
        ? null
        : (await lookupCustomerContext(phoneNum.businessId, normalizedCaller || call.from_number)).customer?.name || null;

      // Mark as test call if the business hasn't completed onboarding yet
      const business = await prisma.business.findUnique({
        where: { id: phoneNum.businessId },
        select: { onboardingComplete: true },
      });
      const isTestCall = Boolean(demoResolution) || !(business?.onboardingComplete ?? true);

      await prisma.call.upsert({
        where: { retellCallId: call.call_id },
        create: {
          businessId: phoneNum.businessId,
          retellCallId: call.call_id,
          callerPhone: normalizedCaller || call.from_number,
          callerName: knownName,
          status: "IN_PROGRESS",
          isTestCall,
        },
        update: {
          status: "IN_PROGRESS",
          callerName: knownName,
          callerPhone: normalizedCaller || call.from_number,
          isTestCall,
        },
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
    const isOutbound = call.direction === "outbound";
    const normalizedCaller = normalizePhoneNumber(isOutbound ? call.to_number : call.from_number);
    const calledNumber = normalizePhoneNumber(isOutbound ? call.from_number : call.to_number);

    const duration = call.duration_ms
      ? Math.round(call.duration_ms / 1000)
      : call.start_timestamp && call.end_timestamp
        ? Math.round((call.end_timestamp - call.start_timestamp) / 1000)
        : null;

    // For outbound calls, the pre-created Call record already links to the business.
    // Just update it with final data.
    if (isOutbound && call.call_id) {
      await prisma.call.updateMany({
        where: { retellCallId: call.call_id },
        data: {
          duration,
          transcript: call.transcript || null,
          transcriptObject: call.transcript_object ? (call.transcript_object as object[]) : undefined,
          status: "COMPLETED",
          recordingUrl: call.recording_url || null,
        },
      });
      return new NextResponse(null, { status: 204 });
    }

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
          callerPhone: normalizedCaller || call.from_number,
          duration,
          transcript: call.transcript || null,
          transcriptObject: call.transcript_object ? (call.transcript_object as object[]) : undefined,
          status: "COMPLETED",
          recordingUrl: call.recording_url || null,
        },
      });
    } else {
      await prisma.call.create({
        data: {
          businessId: business.id,
          retellCallId: call.call_id,
          callerPhone: normalizedCaller || call.from_number,
          duration,
          transcript: call.transcript || null,
          transcriptObject: call.transcript_object ? (call.transcript_object as object[]) : undefined,
          status: "COMPLETED",
          recordingUrl: call.recording_url || null,
        },
      });
    }
  } catch (err) {
    console.error("[webhook] handleCallEnded DB error:", err);
    // Return 500 so Retell retries — a 204 here would silently lose the call record
    return new NextResponse(null, { status: 500 });
  }

  return new NextResponse(null, { status: 204 });
}

async function handleCallAnalyzed(call: RetellCallPayload) {
  if (!call.call_id) return new NextResponse(null, { status: 204 });
  const isOutbound = call.direction === "outbound";
  const customerPhone =
    normalizePhoneNumber(isOutbound ? call.to_number : call.from_number) || null;

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

    if (callerName && !existingCall.isTestCall) {
      try {
        await upsertCustomerMemoryFromCall({
          businessId: existingCall.businessId,
          customerName: callerName,
          customerPhone: customerPhone || existingCall.callerPhone,
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
      } catch (memErr) {
        console.error("[webhook] upsertCustomerMemoryFromCall failed (non-fatal):", memErr);
      }
    }

    const refreshedCall = await prisma.call.findUnique({
      where: { retellCallId: call.call_id },
      include: { business: { include: { phoneNumber: true } } },
    });

    if (
      refreshedCall &&
      !refreshedCall.isTestCall &&
      !refreshedCall.appointmentId &&
      refreshedCall.status !== "NO_BOOKING"
    ) {
      await prisma.call.update({
        where: { id: refreshedCall.id },
        data: { status: "NO_BOOKING" },
      });

      try {
        await sendMissedCallNotification(
          refreshedCall.business as Parameters<
            typeof sendMissedCallNotification
          >[0],
          (isOutbound ? call.to_number : call.from_number) ||
            refreshedCall.callerPhone ||
            "Unknown",
          refreshedCall.callerName || undefined
        );
      } catch (notifyErr) {
        console.error("[webhook] sendMissedCallNotification failed (non-fatal):", notifyErr);
      }
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
