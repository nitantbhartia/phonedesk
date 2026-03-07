import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Generate and verify HMAC tokens for appointment actions (confirm/cancel).
 * Prevents unauthenticated users from modifying appointments by guessing IDs.
 */

function getSecret(): string {
  const secret = process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error("Missing NEXTAUTH_SECRET for appointment token signing");
  }
  return secret;
}

/** Generate an HMAC token for an appointment action */
export function generateAppointmentToken(appointmentId: string, action: "confirm" | "cancel"): string {
  return createHmac("sha256", getSecret())
    .update(`${action}:${appointmentId}`)
    .digest("hex");
}

/** Verify an HMAC token for an appointment action */
export function verifyAppointmentToken(
  appointmentId: string,
  action: "confirm" | "cancel",
  token: string
): boolean {
  const expected = generateAppointmentToken(appointmentId, action);
  const tokenBuf = Buffer.from(token, "utf8");
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
