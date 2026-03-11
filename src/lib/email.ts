import nodemailer from "nodemailer";

function getTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? "587", 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    // In development without SMTP config, log to console instead
    if (process.env.NODE_ENV !== "production") {
      return null;
    }
    throw new Error(
      "Email not configured. Set SMTP_HOST, SMTP_USER, and SMTP_PASS environment variables."
    );
  }

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  });
}

const FROM_ADDRESS =
  process.env.SMTP_FROM ?? `RingPaw <noreply@ringpaw.com>`;

export async function sendEmail({
  to,
  subject,
  html,
  text,
}: {
  to: string;
  subject: string;
  html: string;
  text: string;
}) {
  const transporter = getTransporter();

  if (!transporter) {
    // Dev fallback — print to console
    console.log(`\n[EMAIL DEV] To: ${to}\nSubject: ${subject}\n${text}\n`);
    return;
  }

  await transporter.sendMail({
    from: FROM_ADDRESS,
    to,
    subject,
    html,
    text,
  });
}

export async function sendDemoMagicLink({
  to,
  magicLink,
  businessName,
}: {
  to: string;
  magicLink: string;
  businessName?: string;
}) {
  const greeting = businessName ? `Hi ${businessName}!` : "Hi there!";

  const text = [
    `${greeting}`,
    ``,
    `Here's your magic link to unlock the RingPaw live AI demo:`,
    ``,
    magicLink,
    ``,
    `This link expires in 1 hour and can only be used once.`,
    ``,
    `If you didn't request this, you can safely ignore it.`,
    ``,
    `— The RingPaw team`,
  ].join("\n");

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
</head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; background: #f5f0e8; margin: 0; padding: 40px 20px;">
  <div style="max-width: 480px; margin: 0 auto; background: #fffdf7; border-radius: 24px; padding: 40px; box-shadow: 0 4px 24px rgba(0,0,0,0.08);">
    <div style="text-align: center; margin-bottom: 32px;">
      <span style="font-size: 32px;">🐾</span>
      <h1 style="color: #3d2b1a; font-size: 22px; font-weight: 800; margin: 12px 0 4px;">Your demo is ready</h1>
      <p style="color: #7a5c42; font-size: 14px; margin: 0;">${greeting} Click below to try the live AI demo.</p>
    </div>

    <a href="${magicLink}" style="display: block; background: #3d2b1a; color: #fffdf7; text-align: center; padding: 16px 24px; border-radius: 50px; font-weight: 700; font-size: 16px; text-decoration: none; margin-bottom: 24px;">
      Launch live demo →
    </a>

    <p style="color: #a08060; font-size: 12px; text-align: center; margin: 0;">
      Link expires in 1 hour · one-time use<br>
      If you didn't request this, ignore this email.
    </p>
  </div>
</body>
</html>
  `.trim();

  await sendEmail({ to, subject: "Your RingPaw demo link", html, text });
}
