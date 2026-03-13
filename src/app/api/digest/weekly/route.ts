import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendEmail } from "@/lib/email";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    include: {
      business: {
        include: {
          services: { where: { isActive: true } },
          phoneNumber: true,
        },
      },
    },
  });

  const business = user?.business;
  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const toEmail = business.email || session.user.email;
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

  // Gather this week's data
  const [calls, appointments, lapsingCount] = await Promise.all([
    prisma.call.findMany({
      where: {
        businessId: business.id,
        isTestCall: false,
        isOutbound: false,
        createdAt: { gte: weekAgo },
      },
      select: {
        status: true,
        duration: true,
        appointmentId: true,
        summary: true,
        extractedData: true,
        callerName: true,
      },
    }),
    prisma.appointment.findMany({
      where: {
        businessId: business.id,
        createdAt: { gte: weekAgo },
      },
      select: {
        status: true,
        serviceName: true,
        startTime: true,
      },
    }),
    // Count lapsing clients (no visit in 42+ days)
    prisma.customer.count({
      where: {
        businessId: business.id,
        lastVisitAt: {
          lt: new Date(now.getTime() - 42 * 24 * 60 * 60 * 1000),
        },
      },
    }),
  ]);

  // Compute stats
  const totalCalls = calls.length;
  const bookedCalls = calls.filter((c) => c.appointmentId).length;
  const missedCalls = calls.filter((c) => c.status === "MISSED").length;
  const avgDuration = calls.length
    ? Math.round(calls.filter((c) => c.duration).reduce((s, c) => s + (c.duration ?? 0), 0) / calls.filter((c) => c.duration).length)
    : 0;
  const bookingRate = totalCalls > 0 ? Math.round((bookedCalls / totalCalls) * 100) : 0;

  // Top requested service from extractedData
  const serviceCounts: Record<string, number> = {};
  for (const call of calls) {
    const extracted = call.extractedData as Record<string, string> | null;
    const svc = extracted?.service || extracted?.serviceName;
    if (svc) serviceCounts[svc] = (serviceCounts[svc] ?? 0) + 1;
  }
  const topService = Object.entries(serviceCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;

  // Revenue estimate ($75 avg per booking)
  const AVG_BOOKING_VALUE = 75;
  const estimatedRevenue = bookedCalls * AVG_BOOKING_VALUE;

  // Opportunity insight
  let insight = "";
  if (lapsingCount > 5) {
    insight = `${lapsingCount} clients haven't been in for 6+ weeks. Try the AI Call feature on the No-Shows page to win them back.`;
  } else if (missedCalls > 3) {
    insight = `${missedCalls} calls were missed this week. Consider expanding your business hours to capture more bookings.`;
  } else if (bookingRate < 40 && totalCalls > 3) {
    insight = `Your booking conversion rate is ${bookingRate}%. Review recent call transcripts — callers may be asking questions your AI isn't answering yet.`;
  } else if (totalCalls === 0) {
    insight = `No calls this week. Make sure your AI agent is active and your phone number is forwarding correctly.`;
  } else {
    insight = `Great week! Your AI handled ${totalCalls} call${totalCalls !== 1 ? "s" : ""} and booked ${bookedCalls} appointment${bookedCalls !== 1 ? "s" : ""}. Keep it up.`;
  }

  const html = buildDigestHtml({
    businessName: business.name,
    ownerName: business.ownerName ?? "there",
    totalCalls,
    bookedCalls,
    missedCalls,
    bookingRate,
    avgDuration,
    estimatedRevenue,
    topService,
    lapsingCount,
    insight,
    weekOf: weekAgo.toLocaleDateString("en-US", { month: "long", day: "numeric" }) +
      " – " + now.toLocaleDateString("en-US", { month: "long", day: "numeric", year: "numeric" }),
  });

  const text = buildDigestText({
    businessName: business.name,
    ownerName: business.ownerName ?? "there",
    totalCalls,
    bookedCalls,
    missedCalls,
    bookingRate,
    avgDuration,
    estimatedRevenue,
    topService,
    lapsingCount,
    insight,
  });

  await sendEmail({
    to: toEmail,
    subject: `📊 Your RingPaw weekly recap — ${business.name}`,
    html,
    text,
  });

  return NextResponse.json({ sent: true, to: toEmail });
}

interface DigestData {
  businessName: string;
  ownerName: string;
  totalCalls: number;
  bookedCalls: number;
  missedCalls: number;
  bookingRate: number;
  avgDuration: number;
  estimatedRevenue: number;
  topService: string | null;
  lapsingCount: number;
  insight: string;
  weekOf?: string;
}

function buildDigestHtml(d: DigestData): string {
  const statBox = (label: string, value: string, sub?: string) => `
    <div style="background:#f5f0e8;border-radius:16px;padding:20px 24px;text-align:center;">
      <div style="font-size:28px;font-weight:800;color:#3d2b1a;line-height:1;">${value}</div>
      <div style="font-size:12px;font-weight:700;color:#7a5c42;margin-top:4px;text-transform:uppercase;letter-spacing:0.05em;">${label}</div>
      ${sub ? `<div style="font-size:11px;color:#a08060;margin-top:2px;">${sub}</div>` : ""}
    </div>`;

  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;background:#f5f0e8;margin:0;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;">

    <!-- Header -->
    <div style="text-align:center;margin-bottom:32px;">
      <span style="font-size:36px;">🐾</span>
      <h1 style="color:#3d2b1a;font-size:24px;font-weight:800;margin:12px 0 4px;">Weekly AI Recap</h1>
      <p style="color:#7a5c42;font-size:14px;margin:0;">Hi ${d.ownerName} — here's how ${d.businessName} did this week</p>
      ${d.weekOf ? `<p style="color:#a08060;font-size:12px;margin:4px 0 0;">${d.weekOf}</p>` : ""}
    </div>

    <!-- Stats grid -->
    <div style="background:#fffdf7;border-radius:24px;padding:28px;margin-bottom:16px;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
      <h2 style="color:#3d2b1a;font-size:14px;font-weight:700;margin:0 0 16px;text-transform:uppercase;letter-spacing:0.05em;">This week's numbers</h2>
      <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;">
        ${statBox("Calls Handled", String(d.totalCalls))}
        ${statBox("Appointments Booked", String(d.bookedCalls), `${d.bookingRate}% conversion`)}
        ${statBox("Revenue Protected", `$${d.estimatedRevenue.toLocaleString()}`, "est. @ avg booking")}
      </div>
      <div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-top:12px;">
        ${statBox("Avg Call Length", d.avgDuration > 0 ? `${Math.floor(d.avgDuration / 60)}m ${d.avgDuration % 60}s` : "—")}
        ${statBox("Missed Calls", String(d.missedCalls), d.missedCalls > 0 ? "check your hours" : "great!")}
      </div>
    </div>

    ${d.topService ? `
    <!-- Top service -->
    <div style="background:#fffdf7;border-radius:24px;padding:24px 28px;margin-bottom:16px;box-shadow:0 4px 24px rgba(0,0,0,0.06);">
      <h2 style="color:#3d2b1a;font-size:14px;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.05em;">Most Requested Service</h2>
      <p style="color:#3d2b1a;font-size:20px;font-weight:800;margin:0;">${d.topService}</p>
    </div>` : ""}

    ${d.lapsingCount > 0 ? `
    <!-- Lapsing clients -->
    <div style="background:#fff8e6;border:1.5px solid #d4a85340;border-radius:24px;padding:24px 28px;margin-bottom:16px;">
      <h2 style="color:#3d2b1a;font-size:14px;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.05em;">⚠️ Win-Back Opportunity</h2>
      <p style="color:#5c4020;font-size:15px;margin:0;"><strong>${d.lapsingCount} client${d.lapsingCount !== 1 ? "s" : ""}</strong> haven't been in for 6+ weeks.</p>
      <p style="color:#7a5c42;font-size:13px;margin:6px 0 0;">Open the No-Shows page in RingPaw to send an AI call or text blast.</p>
    </div>` : ""}

    <!-- Insight -->
    <div style="background:#3d2b1a;border-radius:24px;padding:28px;margin-bottom:32px;">
      <h2 style="color:#d4a853;font-size:14px;font-weight:700;margin:0 0 8px;text-transform:uppercase;letter-spacing:0.05em;">💡 This Week's Insight</h2>
      <p style="color:#fffdf7;font-size:15px;margin:0;line-height:1.6;">${d.insight}</p>
    </div>

    <!-- CTA -->
    <div style="text-align:center;margin-bottom:32px;">
      <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ringpaw.com"}/calls"
         style="display:inline-block;background:#d4a853;color:#3d2b1a;padding:14px 32px;border-radius:50px;font-weight:700;font-size:15px;text-decoration:none;">
        View full call history →
      </a>
    </div>

    <!-- Footer -->
    <p style="color:#a08060;font-size:12px;text-align:center;margin:0;">
      RingPaw AI Receptionist · <a href="${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ringpaw.com"}/settings/agent" style="color:#a08060;">Manage agent settings</a>
    </p>

  </div>
</body>
</html>`;
}

function buildDigestText(d: DigestData): string {
  return [
    `Weekly AI Recap — ${d.businessName}`,
    `Hi ${d.ownerName}!`,
    "",
    "THIS WEEK'S NUMBERS",
    `• Calls handled: ${d.totalCalls}`,
    `• Appointments booked: ${d.bookedCalls} (${d.bookingRate}% conversion)`,
    `• Revenue protected: $${d.estimatedRevenue.toLocaleString()} est.`,
    `• Avg call length: ${d.avgDuration > 0 ? `${Math.floor(d.avgDuration / 60)}m ${d.avgDuration % 60}s` : "—"}`,
    `• Missed calls: ${d.missedCalls}`,
    d.topService ? `• Most requested service: ${d.topService}` : "",
    "",
    d.lapsingCount > 0 ? `WIN-BACK OPPORTUNITY: ${d.lapsingCount} clients haven't been in for 6+ weeks. Visit the No-Shows page to reach out.` : "",
    "",
    `THIS WEEK'S INSIGHT`,
    d.insight,
    "",
    `View your full call history: ${process.env.NEXT_PUBLIC_APP_URL ?? "https://app.ringpaw.com"}/calls`,
  ].filter(Boolean).join("\n");
}
