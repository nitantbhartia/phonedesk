import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { normalizePhoneNumber } from "@/lib/phone";
import {
  handleBookableDigit,
  resolveInboundPath,
  startBookableCall,
} from "@/lib/bookable";

/**
 * Walk the Bookable DTMF tree without a live phone call.
 *
 * Start:  POST { "to": "+1...", "from": "+1..." }
 * Step:   POST { "sessionId": "...", "digit": "1" }
 */
export async function POST(req: NextRequest) {
  let body: {
    to?: string;
    from?: string;
    sessionId?: string;
    digit?: string;
    businessId?: string;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  if (body.sessionId) {
    const session = await prisma.bookableSession.findUnique({
      where: { id: body.sessionId },
    });
    if (!session) {
      return NextResponse.json({ error: "Session not found" }, { status: 404 });
    }
    const result = await handleBookableDigit(session, body.digit ?? "");
    return NextResponse.json({
      sessionId: result.session.id,
      state: result.prompt.state,
      status: result.prompt.status,
      say: result.prompt.say,
      gather: Boolean(result.prompt.gather),
      record: Boolean(result.prompt.record),
      hangup: Boolean(result.prompt.hangup),
      slots: result.prompt.slots || [],
      appointmentId: result.prompt.appointmentId,
      bookingKind: result.session.bookingKind,
      calendarEventId: result.session.calendarEventId,
      smsCustomerStatus: result.session.smsCustomerStatus,
      smsOwnerStatus: result.session.smsOwnerStatus,
    });
  }

  const to = normalizePhoneNumber(body.to) || body.to;
  const from = normalizePhoneNumber(body.from) || body.from || "+15555550100";
  const business = body.businessId
    ? await prisma.business.findUnique({ where: { id: body.businessId } })
    : to
      ? (
          await prisma.phoneNumber.findFirst({
            where: { number: to },
            include: { business: true },
          })
        )?.business
      : await prisma.business.findFirst({ orderBy: { createdAt: "asc" } });

  if (!business) {
    return NextResponse.json(
      { error: "No shop found. Pass to= your Call Slot number or businessId." },
      { status: 404 }
    );
  }

  if (resolveInboundPath(business) !== "BOOKABLE_VOICEMAIL") {
    return NextResponse.json(
      { error: "This shop is set to the Retell inbound path. Set inboundPath to BOOKABLE_VOICEMAIL." },
      { status: 409 }
    );
  }

  const callSid = `sim_${randomUUID()}`;
  const call = await prisma.call.create({
    data: {
      businessId: business.id,
      retellCallId: `sim:${callSid}`,
      callerPhone: from,
      status: "IN_PROGRESS",
      isTestCall: true,
      summary: "Call Slot simulate",
    },
  });

  const { session, prompt } = await startBookableCall({
    businessId: business.id,
    callSid,
    callerPhone: from,
    calledNumber: to || business.phone,
    callId: call.id,
  });

  return NextResponse.json({
    sessionId: session.id,
    state: prompt.state,
    status: prompt.status,
    say: prompt.say,
    gather: true,
    knownCaller: session.knownCaller,
    howToContinue: 'POST the same URL with { "sessionId", "digit" }',
  });
}
