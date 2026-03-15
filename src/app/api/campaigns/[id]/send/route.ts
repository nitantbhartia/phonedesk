import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";

// Resolve {petName} and {customerName} tokens in a message template
function resolveTemplate(template: string, vars: { customerName?: string; petName?: string }) {
  return template
    .replace(/\{customerName\}/g, vars.customerName ?? "there")
    .replace(/\{petName\}/g, vars.petName ?? "your pet");
}

// POST: send a campaign to recipients
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
    include: { phoneNumber: true, rebookingConfig: true },
  });
  if (!business) {
    return NextResponse.json({ error: "No business" }, { status: 404 });
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id, businessId: business.id },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Campaign not found" }, { status: 404 });
  }
  if (campaign.status === "SENT") {
    return NextResponse.json({ error: "Campaign already sent" }, { status: 400 });
  }

  const fromNumber =
    business.phoneNumber?.number ?? process.env.TWILIO_PHONE_NUMBER;
  if (!fromNumber) {
    return NextResponse.json({ error: "No phone number configured" }, { status: 400 });
  }

  const now = new Date();
  const defaultInterval = business.rebookingConfig?.defaultInterval ?? 42;
  const segment = campaign.targetSegment as Record<string, unknown> | null;

  // Build recipient list based on campaign type + optional segment filters
  let recipients: { phone: string; name: string; petName?: string }[] = [];

  if (campaign.type === "WIN_BACK") {
    // Customers overdue for rebooking, no future appointments
    const lapseThreshold = new Date(
      now.getTime() - defaultInterval * 24 * 60 * 60 * 1000
    );
    const customers = await prisma.customer.findMany({
      where: {
        businessId: business.id,
        smsOptOut: false,
        lastVisitAt: { lte: lapseThreshold },
      },
      select: { phone: true, name: true, pets: { select: { name: true }, take: 1 } },
    });
    // Filter out customers with future appointments
    const customerPhones = customers.map((c) => c.phone);
    const futureAppts = await prisma.appointment.findMany({
      where: {
        businessId: business.id,
        status: { in: ["PENDING", "CONFIRMED"] },
        startTime: { gte: now },
        customerPhone: { in: customerPhones },
      },
      select: { customerPhone: true },
    });
    const hasUpcoming = new Set(futureAppts.map((a) => a.customerPhone).filter(Boolean));
    recipients = customers
      .filter((c) => !hasUpcoming.has(c.phone))
      .map((c) => ({ phone: c.phone, name: c.name, petName: c.pets[0]?.name }));
  } else if (campaign.type === "CAPACITY_FILL") {
    // All active customers who haven't been contacted recently (past 14 days)
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const customers = await prisma.customer.findMany({
      where: {
        businessId: business.id,
        smsOptOut: false,
        OR: [
          { lastContactAt: { lte: twoWeeksAgo } },
          { lastContactAt: null },
        ],
      },
      select: { phone: true, name: true, pets: { select: { name: true }, take: 1 } },
      take: 100,
    });
    recipients = customers.map((c) => ({
      phone: c.phone,
      name: c.name,
      petName: c.pets[0]?.name,
    }));
  } else {
    // SEASONAL, NEW_SERVICE, BIRTHDAY, MILESTONE — send to all non-opted-out customers
    const minVisits = typeof segment?.minVisitCount === "number" ? segment.minVisitCount : 1;
    const customers = await prisma.customer.findMany({
      where: {
        businessId: business.id,
        smsOptOut: false,
        visitCount: { gte: minVisits },
      },
      select: { phone: true, name: true, pets: { select: { name: true }, take: 1 } },
    });
    recipients = customers.map((c) => ({
      phone: c.phone,
      name: c.name,
      petName: c.pets[0]?.name,
    }));
  }

  if (recipients.length === 0) {
    return NextResponse.json({ ok: true, sentCount: 0, message: "No eligible recipients" });
  }

  // Send SMS messages (fire and collect results)
  let sentCount = 0;
  const errors: string[] = [];

  await Promise.allSettled(
    recipients.map(async (r) => {
      const message = resolveTemplate(campaign.messageTemplate, {
        customerName: r.name,
        petName: r.petName,
      });
      try {
        await sendSms(r.phone, message, fromNumber);
        sentCount++;
      } catch (err) {
        errors.push(`${r.phone}: ${err instanceof Error ? err.message : String(err)}`);
      }
    })
  );

  // Update campaign record
  await prisma.campaign.update({
    where: { id },
    data: {
      status: "SENT",
      sentAt: now,
      sentCount,
    },
  });

  return NextResponse.json({
    ok: true,
    sentCount,
    totalRecipients: recipients.length,
    errors: errors.length > 0 ? errors.slice(0, 10) : undefined,
  });
}
