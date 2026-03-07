export function isRetellAuthorized(req: Request): boolean {
  const secret = process.env.RETELL_WEBHOOK_SECRET;
  if (!secret) {
    return true;
  }

  const authHeader = req.headers.get("authorization");
  const bearerToken = authHeader?.startsWith("Bearer ")
    ? authHeader.slice("Bearer ".length).trim()
    : null;
  const headerToken =
    req.headers.get("x-retell-secret") || req.headers.get("x-retell-token");
  const queryToken = new URL(req.url).searchParams.get("token");

  return [bearerToken, headerToken, queryToken].some(
    (token) => token === secret
  );
}

export function buildRetellWebhookUrl(baseUrl: string, path: string): string {
  const base = baseUrl.replace(/\/$/, "");
  const pathname = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${base}${pathname}`);
  const secret = process.env.RETELL_WEBHOOK_SECRET;

  if (secret) {
    url.searchParams.set("token", secret);
  }

  return url.toString();
}
