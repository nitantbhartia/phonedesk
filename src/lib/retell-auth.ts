import Retell from "retell-sdk";

/**
 * Verify a Retell webhook/tool request.
 *
 * Supports two auth methods (tried in order):
 * 1. HMAC-SHA256 via x-retell-signature header (verified with RETELL_API_KEY)
 * 2. Shared secret via x-retell-secret / Authorization header (RETELL_WEBHOOK_SECRET)
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

  // Debug: log what we received so we can diagnose auth failures
  console.log("[retell-auth] DEBUG:", {
    hasApiKey: !!apiKey,
    hasWebhookSecret: !!webhookSecret,
    signatureHeader: signature || "(empty)",
    authorizationHeader: headers?.get("authorization") || "(none)",
    xRetellSecret: headers?.get("x-retell-secret") || "(none)",
    xRetellToken: headers?.get("x-retell-token") || "(none)",
    xRetellSignature: headers?.get("x-retell-signature") || "(none)",
    bodyPreview: body?.substring(0, 100) || "(empty)",
  });

  // Try HMAC signature verification first (preferred)
  if (apiKey && signature) {
    try {
      const valid = Retell.verify(body, apiKey, signature);
      if (valid) return true;
      console.warn("[retell-auth] HMAC signature verification returned false");
    } catch (err) {
      console.warn("[retell-auth] HMAC signature verification threw:", err);
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

  // Keys are set but verification failed
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
