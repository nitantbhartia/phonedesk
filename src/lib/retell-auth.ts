import Retell from "retell-sdk";
import { createHmac, timingSafeEqual } from "crypto";

/**
 * Verify a Retell webhook/tool request using HMAC-SHA256 signature.
 *
 * Retell SDK v4+ signs with a compound format: `v={timestamp},d={hex_hmac}`
 * where the HMAC message is `body + timestamp`. The SDK enforces a 5-minute
 * replay window, which can fail if server clocks drift. We therefore:
 *
 *   1. Try the SDK verify with RETELL_API_KEY (new format, strict 5-min window).
 *   2. Try the same compound format manually with a 15-minute window.
 *   3. Try a simple HMAC-SHA256 of the raw body (older/plain signing format).
 *   4. Repeat compound/plain verification with RETELL_WEBHOOK_SECRET when a
 *      separate webhook signing secret is configured.
 *
 * Legacy fallback: compare RETELL_WEBHOOK_SECRET against the signature header
 * directly in case an older deployment still uses a shared token header.
 */
export function isRetellWebhookValid(
  body: string,
  signature: string,
  headers?: Headers,
): boolean {
  const apiKey = process.env.RETELL_API_KEY?.trim();
  const webhookSecret = process.env.RETELL_WEBHOOK_SECRET?.trim();
  const attempts: string[] = [];
  let compoundWithinWindow = false;

  if (apiKey && signature) {
    try {
      attempts.push("apiKey:sdk");
      if (Retell.verify(body, apiKey, signature)) return true;
    } catch {
      attempts.push("apiKey:sdk:error");
    }
  }

  const apiKeyResult = verifyWebhookSignature(body, signature, apiKey, "apiKey");
  attempts.push(...apiKeyResult.attempts);
  compoundWithinWindow ||= apiKeyResult.compoundWithinWindow;
  if (apiKeyResult.valid) {
    return true;
  }

  const webhookResult = verifyWebhookSignature(
    body,
    signature,
    webhookSecret,
    "webhookSecret",
  );
  attempts.push(...webhookResult.attempts);
  compoundWithinWindow ||= webhookResult.compoundWithinWindow;
  if (webhookResult.valid) {
    return true;
  }

  if (webhookSecret && signature) {
    attempts.push("webhookSecret:literal");
    if (timingSafeCompare(webhookSecret, signature)) return true;
  }

  if (!apiKey && !webhookSecret) {
    if (process.env.NODE_ENV === "production") {
      console.error(
        "[retell-auth] Neither RETELL_API_KEY nor RETELL_WEBHOOK_SECRET is set — rejecting",
      );
      return false;
    }
    return true;
  }

  const sigPrefix = signature.slice(0, 20);
  const isCompound = /^v=\d+,d=/.test(signature);
  const tsMatch = /^v=(\d+),d=/.exec(signature);
  const tsAge = tsMatch
    ? Math.round((Date.now() - Number(tsMatch[1])) / 1000) + "s ago"
    : "n/a";
  console.error(
    "[retell-auth] Verification failed.",
    "apiKey set:", !!apiKey,
    "keyLen:", apiKey?.length,
    "keyPrefix:", apiKey?.slice(0, 6),
    "signature present:", !!signature,
    "sigPrefix:", sigPrefix,
    "isCompound:", isCompound,
    "compoundWithinWindow:", compoundWithinWindow,
    "tsAge:", tsAge,
    "webhookSecret set:", !!webhookSecret,
    "attempts:", attempts.join(","),
  );
  return false;
}

function verifyWebhookSignature(
  body: string,
  signature: string,
  secret: string | undefined,
  label: string,
): { valid: boolean; attempts: string[]; compoundWithinWindow: boolean } {
  const attempts: string[] = [];

  if (!secret || !signature) {
    return { valid: false, attempts, compoundWithinWindow: false };
  }

  let compoundWithinWindow = false;

  try {
    attempts.push(`${label}:compound15m`);
    const match = /^v=(\d+),d=(.+)$/.exec(signature);
    if (match) {
      const poststamp = Number(match[1]);
      const postDigest = match[2]!;
      compoundWithinWindow = Math.abs(Date.now() - poststamp) <= 15 * 60 * 1000;
      if (compoundWithinWindow) {
        const computed = createHmac("sha256", secret)
          .update(body + poststamp)
          .digest("hex");
        if (timingSafeCompare(computed, postDigest)) {
          return { valid: true, attempts, compoundWithinWindow };
        }
      }
    }
  } catch {
    attempts.push(`${label}:compound15m:error`);
  }

  try {
    attempts.push(`${label}:plain`);
    const hexSig = createHmac("sha256", secret).update(body).digest("hex");
    const b64Sig = createHmac("sha256", secret).update(body).digest("base64");
    if (timingSafeCompare(hexSig, signature) || timingSafeCompare(b64Sig, signature)) {
      return { valid: true, attempts, compoundWithinWindow };
    }
  } catch {
    attempts.push(`${label}:plain:error`);
  }

  return { valid: false, attempts, compoundWithinWindow };
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
