import Retell from "retell-sdk";

/**
 * Verify a Retell webhook request using HMAC-SHA256 signature.
 * Retell signs the raw JSON body with the API key and sends
 * the signature in the `x-retell-signature` header.
 *
 * The caller must pass the raw body string so we can verify
 * the signature before JSON-parsing.
 */
export function isRetellWebhookValid(body: string, signature: string): boolean {
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      console.error("[retell-auth] RETELL_API_KEY is not set in production — rejecting webhook");
      return false;
    }
    // In dev, allow passthrough when no API key is configured
    return true;
  }

  if (!signature) {
    console.error("[retell-auth] Missing x-retell-signature header");
    return false;
  }

  try {
    return Retell.verify(body, apiKey, signature);
  } catch (err) {
    console.error("[retell-auth] Signature verification failed:", err);
    return false;
  }
}

/**
 * @deprecated Use isRetellWebhookValid with raw body + signature instead.
 * Kept for backwards compatibility during migration.
 */
export function isRetellAuthorized(req: Request): boolean {
  // This legacy function cannot properly verify HMAC signatures because
  // it doesn't have access to the raw request body. Callers should
  // migrate to isRetellWebhookValid.
  const apiKey = process.env.RETELL_API_KEY;
  if (!apiKey) {
    if (process.env.NODE_ENV === "production") {
      console.error("[retell-auth] RETELL_API_KEY is not set — rejecting request");
      return false;
    }
    return true;
  }
  // Cannot verify without raw body; reject in production
  if (process.env.NODE_ENV === "production") {
    console.error("[retell-auth] isRetellAuthorized is deprecated — use isRetellWebhookValid");
    return false;
  }
  return true;
}

export function buildRetellWebhookUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const pathname = path.startsWith("/") ? path : `/${path}`;
  return `${base}${pathname}`;
}
