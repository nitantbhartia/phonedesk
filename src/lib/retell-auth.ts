import { timingSafeEqual } from "node:crypto";

export function isRetellAuthorized(req: Request): boolean {
  const secret = process.env.RETELL_WEBHOOK_SECRET;
  if (!secret) {
    // In production, require a webhook secret. In dev, allow passthrough.
    if (process.env.NODE_ENV === "production") {
      console.error("[retell-auth] RETELL_WEBHOOK_SECRET is not set in production — rejecting request");
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

  // Use timing-safe comparison to prevent timing attacks
  const candidates = [bearerToken, headerToken].filter(Boolean) as string[];
  return candidates.some((token) => {
    const tokenBuf = Buffer.from(token, "utf8");
    const secretBuf = Buffer.from(secret, "utf8");
    if (tokenBuf.length !== secretBuf.length) return false;
    return timingSafeEqual(tokenBuf, secretBuf);
  });
}

export function buildRetellWebhookUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const pathname = path.startsWith("/") ? path : `/${path}`;
  return `${base}${pathname}`;
}
