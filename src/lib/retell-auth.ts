import Retell from "retell-sdk";

/**
 * Verify a Retell webhook/tool request using HMAC-SHA256 signature.
 *
 * Retell signs the **canonical** JSON body (equivalent to JSON.stringify of the
 * parsed object). The raw body from req.text() may have different whitespace,
 * so we try both the raw body and the canonical form.
 *
 * Fallback: shared secret via x-retell-secret / Authorization header.
 */
export function isRetellWebhookValid(
  body: string,
  signature: string,
  headers?: Headers,
): boolean {
  const apiKey = process.env.RETELL_API_KEY;
  const webhookSecret = process.env.RETELL_WEBHOOK_SECRET;

  // Try HMAC signature verification (preferred)
  if (apiKey && signature) {
    // Try raw body first
    try {
      if (Retell.verify(body, apiKey, signature)) return true;
    } catch {
      // fall through
    }

    // Try canonical JSON — Retell signs JSON.stringify(body) per their docs
    try {
      const canonical = JSON.stringify(JSON.parse(body));
      if (canonical !== body && Retell.verify(canonical, apiKey, signature)) {
        return true;
      }
    } catch {
      // fall through
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
