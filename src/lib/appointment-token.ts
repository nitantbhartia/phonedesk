import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Generate and verify HMAC tokens for appointment actions (confirm/cancel).
 * Prevents unauthenticated users from modifying appointments by guessing IDs.
 */

const APPOINTMENT_TOKEN_TTL_MS = 1000 * 60 * 60 * 24 * 14; // 14 days

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Missing NEXTAUTH_SECRET for appointment token signing");
  }
  return secret;
}

/** Generate an HMAC token for an appointment action */
export function generateAppointmentToken(appointmentId: string, action: "confirm" | "cancel"): string {
  const timestamp = Date.now();
  const payload = `${action}:${appointmentId}:${timestamp}`;
  const signature = createHmac("sha256", getSecret()).update(payload).digest("hex");
  return `${timestamp}.${signature}`;
}

function parseSignedToken(token: string): { timestamp: number; signature: string } | null {
  const [rawTimestamp, signature, ...rest] = token.split(".");
  if (!rawTimestamp || !signature || rest.length > 0) return null;
  if (!/^\d+$/.test(rawTimestamp)) return null;
  if (!/^[a-f0-9]{64}$/i.test(signature)) return null;
  const timestamp = Number(rawTimestamp);
  if (!Number.isFinite(timestamp)) return null;
  return { timestamp, signature };
}

function isTimestampValid(timestamp: number): boolean {
  const now = Date.now();
  if (timestamp > now + 60_000) return false; // reject future-skewed tokens
  return now - timestamp <= APPOINTMENT_TOKEN_TTL_MS;
}

/** Verify an HMAC token for an appointment action */
export function verifyAppointmentToken(
  appointmentId: string,
  action: "confirm" | "cancel",
  token: string
): boolean {
  const parsed = parseSignedToken(token);
  if (!parsed) return false;
  if (!isTimestampValid(parsed.timestamp)) return false;

  const expected = createHmac("sha256", getSecret())
    .update(`${action}:${appointmentId}:${parsed.timestamp}`)
    .digest("hex");
  const tokenBuf = Buffer.from(parsed.signature, "utf8");
  const expectedBuf = Buffer.from(expected, "utf8");
  if (tokenBuf.length !== expectedBuf.length) {
    return false;
  }
  return timingSafeEqual(tokenBuf, expectedBuf);
}

/** Build a confirm link URL with a signed token */
export function buildConfirmLink(appointmentId: string): string {
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const token = generateAppointmentToken(appointmentId, "confirm");
  return `${appUrl}/api/appointments/confirm?id=${appointmentId}&token=${token}`;
}
