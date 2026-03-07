import { NextRequest, NextResponse } from "next/server";

/**
 * Verify cron endpoint authorization.
 * Returns null if authorized, or a 401 response if not.
 * In production, CRON_SECRET must be set — otherwise all requests are rejected.
 */
export function verifyCronAuth(req: NextRequest): NextResponse | null {
  const authHeader = req.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret) {
    if (process.env.NODE_ENV === "production") {
      console.error("[cron-auth] CRON_SECRET is not set in production — rejecting request");
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    // In development, allow requests without CRON_SECRET
    return null;
  }

  if (authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  return null;
}
