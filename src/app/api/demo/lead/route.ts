import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { rateLimit } from "@/lib/rate-limit";
import { sendEmail } from "@/lib/email";
import { getOwnerDashboardEmails } from "@/lib/owner-auth";

/**
 * POST /api/demo/lead
 *
 * Public lead capture form submitted after a demo call.
 * Upserts into DemoLead and notifies owner dashboard emails.
 */
export async function POST(req: Request) {
  const ip =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    "unknown";

  const { allowed } = rateLimit(`demo-lead:${ip}`, {
    limit: 10,
    windowMs: 60 * 60 * 1000,
  });
  if (!allowed) {
    return NextResponse.json(
      { error: "Too many submissions. Please try again later." },
      { status: 429 }
    );
  }

  let body: { name?: string; email?: string; phone?: string; businessName?: string } = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { name, email, phone, businessName } = body;

  if (!name?.trim() || !email?.trim() || !phone?.trim() || !businessName?.trim()) {
    return NextResponse.json(
      { error: "All fields are required: name, email, phone, businessName" },
      { status: 400 }
    );
  }

  const emailLower = email.trim().toLowerCase();

  // Basic email validation
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailLower)) {
    return NextResponse.json({ error: "Invalid email address" }, { status: 400 });
  }

  // Upsert into DemoLead
  await prisma.demoLead.upsert({
    where: { email: emailLower },
    create: {
      email: emailLower,
      contactName: name.trim(),
      phone: phone.trim(),
      businessName: businessName.trim(),
      ipAtCreation: ip,
    },
    update: {
      contactName: name.trim(),
      phone: phone.trim(),
      businessName: businessName.trim(),
    },
  });

  // Notify owner dashboard emails
  const ownerEmails = getOwnerDashboardEmails();
  if (ownerEmails.length > 0) {
    const subject = `New RingPaw Lead: ${businessName.trim()}`;
    const text = [
      `New lead from the demo page:`,
      ``,
      `Name: ${name.trim()}`,
      `Email: ${emailLower}`,
      `Phone: ${phone.trim()}`,
      `Business: ${businessName.trim()}`,
      ``,
      `— RingPaw Lead Notification`,
    ].join("\n");

    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f0e8; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #fffdf7; border-radius: 24px; padding: 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 24px;">
      <span style="font-size: 32px;">🐾</span>
      <h1 style="color: #3d2b1a; font-size: 20px; font-weight: 800; margin: 12px 0 4px;">New Lead from Demo</h1>
    </div>
    <table style="width: 100%; border-collapse: collapse; font-size: 14px; color: #3d2b1a;">
      <tr><td style="padding: 8px 0; font-weight: 700;">Name</td><td style="padding: 8px 0;">${name.trim()}</td></tr>
      <tr><td style="padding: 8px 0; font-weight: 700;">Email</td><td style="padding: 8px 0;"><a href="mailto:${emailLower}">${emailLower}</a></td></tr>
      <tr><td style="padding: 8px 0; font-weight: 700;">Phone</td><td style="padding: 8px 0;"><a href="tel:${phone.trim()}">${phone.trim()}</a></td></tr>
      <tr><td style="padding: 8px 0; font-weight: 700;">Business</td><td style="padding: 8px 0;">${businessName.trim()}</td></tr>
    </table>
  </div>
</body>
</html>`.trim();

    // Send to all owner emails (fire and forget — don't block the response)
    for (const ownerEmail of ownerEmails) {
      sendEmail({ to: ownerEmail, subject, html, text }).catch((err) => {
        console.error(`[demo/lead] Failed to notify ${ownerEmail}:`, err);
      });
    }
  }

  return NextResponse.json({ success: true });
}
