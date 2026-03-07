import Retell from "retell-sdk";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify a Retell webhook/tool request using HMAC-SHA256 signature.
 *
 * Retell SDK v4+ signs with a compound format: `v={timestamp},d={hex_hmac}`
 * where the HMAC message is `body + timestamp`. The SDK enforces a 5-minute
 * replay window, which can fail if server clocks drift. We therefore:
 *
 *   1. Try the SDK verify (new format, strict 5-min window).
 *   2. Try the same compound format manually with a 15-min window (clock drift).
 *   3. Try a simple HMAC-SHA256 of the raw body (older Retell signing format).
 *
 * Fallback: RETELL_WEBHOOK_SECRET compared against the x-retell-signature
 * header directly (useful when the API key and signing key differ).
 */
export function isRetellWebhookValid(
  body: string,
  signature: string,
  headers?: Headers,
): boolean {
  const apiKey = process.env.RETELL_API_KEY?.trim();
  const webhookSecret = process.env.RETELL_WEBHOOK_SECRET?.trim();

  // Try HMAC signature verification (preferred)
  if (apiKey && signature) {
    // 1. SDK verify — handles compound format v={ts},d={hex_hmac} with 5-min window
    try {
      if (Retell.verify(body, apiKey, signature)) return true;
    } catch {
      // fall through
    }

    // 2. Same compound format but with a 15-minute window to tolerate clock drift
    try {
      const match = /^v=(\d+),d=(.+)$/.exec(signature);
      if (match) {
        const poststamp = Number(match[1]);
        const postDigest = match[2]!;
        if (Math.abs(Date.now() - poststamp) <= 15 * 60 * 1000) {
          const computed = createHmac("sha256", apiKey)
            .update(body + poststamp)
            .digest("hex");
          const a = Buffer.from(computed);
          const b = Buffer.from(postDigest);
          if (a.length === b.length && timingSafeEqual(a, b)) return true;
        }
      }
    } catch {
      // fall through
    }

    // 3. Simple HMAC-SHA256 of body (older/plain Retell signing — no timestamp)
    try {
      const hexSig = createHmac("sha256", apiKey).update(body).digest("hex");
      const b64Sig = createHmac("sha256", apiKey)
        .update(body)
        .digest("base64");
      if (
        timingSafeCompare(hexSig, signature) ||
        timingSafeCompare(b64Sig, signature)
      ) {
        return true;
      }
    } catch {
      // fall through
    }
  }

  // Fallback: RETELL_WEBHOOK_SECRET compared against the signature header
  // (covers setups where a separate signing secret is configured)
  if (webhookSecret && signature) {
    if (timingSafeCompare(webhookSecret, signature)) return true;
  }

  // No keys configured at all — passthrough in dev
  if (!apiKey && !webhookSecret) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[retell-auth] Neither RETELL_API_KEY nor RETELL_WEBHOOK_SECRET is set — rejecting",
      );
      return false;
    }
    return true;
  }

  console.error(
    "[retell-auth] Verification failed. apiKey set:",
    !!apiKey,
    "signature present:",
    !!signature,
    "webhookSecret set:",
    !!webhookSecret,
  );
  return false;
}

function timingSafeCompare(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  return timingSafeEqual(bufA, bufB);
}

/**
 * Header-based auth check for Retell requests that don't use raw body verification.
 * Checks RETELL_WEBHOOK_SECRET against common auth headers.
 */
export function isRetellAuthorized(req: Request): boolean {
  const webhookSecret = process.env.RETELL_WEBHOOK_SECRET;
  if (!webhookSecret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[retell-auth] RETELL_WEBHOOK_SECRET is not set — rejecting");
      return false;
    }
    return true;
  }

  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const headerToken =
    req.headers.get("x-retell-secret") || req.headers.get("x-retell-token");

  const candidates = [bearerToken, headerToken].filter(Boolean) as string[];
  return candidates.some((token) => token === webhookSecret);
}

export function buildRetellWebhookUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const pathname = path.startsWith("/") ? path : `/${path}`;
  return `${base}${pathname}`;
}
