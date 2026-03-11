/**
 * Signed live demo token (ldt).
 *
 * Format: base64url(payload).base64url(hmac-sha256-signature)
 * Payload: { leadId, exp } (exp = unix seconds)
 *
 * This is a lightweight HMAC-signed token — NOT a full JWT.
 * The real enforcement (cooldown, verified status, etc.) is always
 * checked server-side against the DemoLead DB row.
 * The token is just a tamper-proof transport for the leadId.
 */

import { createHmac, timingSafeEqual } from "crypto";

const TOKEN_TTL_S = 60 * 60; // 1 hour

function getSecret(): string {
  const s = process.env.DEMO_TOKEN_SECRET ?? process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!s) throw new Error("DEMO_TOKEN_SECRET (or NEXTAUTH_SECRET) is not set");
  return s;
}

function b64url(buf: Buffer): string {
  return buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function sign(payload: string, secret: string): string {
  return b64url(createHmac("sha256", secret).update(payload).digest());
}

export function issueDemoToken(leadId: string): string {
  const exp = Math.floor(Date.now() / 1000) + TOKEN_TTL_S;
  const payload = b64url(Buffer.from(JSON.stringify({ leadId, exp })));
  const sig = sign(payload, getSecret());
  return `${payload}.${sig}`;
}

export type DemoTokenPayload = { leadId: string; exp: number };

export function verifyDemoToken(token: string): DemoTokenPayload | null {
  try {
    const dot = token.lastIndexOf(".");
    if (dot < 0) return null;
    const payload = token.slice(0, dot);
    const givenSig = token.slice(dot + 1);
    const expectedSig = sign(payload, getSecret());
    // Constant-time compare
    const a = Buffer.from(givenSig);
    const b = Buffer.from(expectedSig);
    if (a.length !== b.length || !timingSafeEqual(a, b)) return null;
    const parsed = JSON.parse(Buffer.from(payload, "base64").toString()) as DemoTokenPayload;
    if (Math.floor(Date.now() / 1000) > parsed.exp) return null; // expired
    return parsed;
  } catch {
    return null;
  }
}
