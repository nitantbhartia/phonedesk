import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { syncRetellAgent } from "@/lib/retell";

/**
 * POST /api/admin/sync-agents
 *
 * Re-pushes the latest system prompt + tools to all configured Retell agents.
 * Run this after any code change to buildAgentTools() or generateSystemPrompt().
 *
 * Optional body: { businessId: "clx..." }  — sync only one business.
 *
 * Auth: requires ADMIN_SECRET env var as Bearer token.
 */
export async function POST(req: Request) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET is not configured" },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { businessId?: string } = {};
  try {
    body = await req.json();
  } catch {
    // empty body is fine
  }

  const where = body.businessId ? { id: body.businessId } : {};

  const businesses = await prisma.business.findMany({
    where: { ...where, retellConfig: { isNot: null } },
    include: {
      services: { where: { isActive: true } },
      breedRecommendations: { orderBy: { priority: "desc" } },
      groomers: { where: { isActive: true } },
      retellConfig: true,
    },
  });

  if (businesses.length === 0) {
    return NextResponse.json({
      ok: true,
      synced: 0,
      message: "No businesses with Retell config found.",
    });
  }

  const results: { businessId: string; name: string; status: string; error?: string }[] = [];

  for (const business of businesses) {
    try {
      await syncRetellAgent(business);
      results.push({ businessId: business.id, name: business.name, status: "ok" });
    } catch (err) {
      results.push({
        businessId: business.id,
        name: business.name,
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  const failed = results.filter((r) => r.status === "error");
  return NextResponse.json(
    {
      ok: failed.length === 0,
      synced: results.filter((r) => r.status === "ok").length,
      failed: failed.length,
      results,
    },
    { status: failed.length > 0 ? 207 : 200 }
  );
}
