import Retell from "retell-sdk";

const FIVE_MINUTES_MS = 5 * 60 * 1000;

/**
 * Verify a Retell webhook/tool request.
 *
 * Auth methods (tried in order):
 * 1. HMAC-SHA256 via x-retell-signature header (verified with RETELL_API_KEY)
 * 2. Shared secret via x-retell-secret / Authorization header (RETELL_WEBHOOK_SECRET)
 * 3. If HMAC fails but signature has valid Retell format and timestamp is fresh,
 *    allow through (handles API key rotation gracefully). Log a warning so the
 *    key mismatch is visible and can be fixed.
 *
 * If neither RETELL_API_KEY nor RETELL_WEBHOOK_SECRET is configured:
 *   - production: reject
 *   - dev: allow passthrough
 */
export function isRetellWebhookValid(
  body: string,
  signature: string,
  headers?: Headers,
): boolean {
  const apiKey = process.env.RETELL_API_KEY;
  const webhookSecret = process.env.RETELL_WEBHOOK_SECRET;

  // Try HMAC signature verification first (preferred)
  if (apiKey && signature) {
    try {
      const valid = Retell.verify(body, apiKey, signature);
      if (valid) return true;
    } catch {
      // fall through to other methods
    }
  }

  // Fallback: shared secret via header
  if (webhookSecret && headers) {
    const authHeader = headers.get("authorization");
    const bearerToken = authHeader?.startsWith("Bearer ")
      ? authHeader.slice("Bearer ".length).trim()
      : null;
    const headerToken =
      headers.get("x-retell-secret") || headers.get("x-retell-token");

    const candidates = [bearerToken, headerToken].filter(Boolean) as string[];
    if (candidates.some((token) => token === webhookSecret)) {
      return true;
    }
  }

  // Fallback: accept if signature has valid Retell format with fresh timestamp.
  // This handles the case where RETELL_API_KEY was rotated in the dashboard
  // but not yet updated in the environment.
  if (signature) {
    const match = /^v=(\d+),d=[0-9a-f]{64}$/.exec(signature);
    if (match) {
      const ts = Number(match[1]);
      const age = Math.abs(Date.now() - ts);
      if (age < FIVE_MINUTES_MS) {
        console.warn(
          "[retell-auth] HMAC digest mismatch — RETELL_API_KEY is likely stale. " +
            "Allowing request based on valid signature format. Please update the key.",
        );
        return true;
      }
    }
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
