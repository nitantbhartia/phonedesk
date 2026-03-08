// Next.js instrumentation hook — runs once when the server starts.
// See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateEnv } = await import("./lib/env");
    try {
      validateEnv();
    } catch (error) {
      console.error("[env]", error instanceof Error ? error.message : error);
      // Don't crash the process — log the warning so deploy logs show it
    }

    // Sync all active Retell agents on startup so system prompt changes
    // from code deploys take effect immediately without manual resync.
    syncAllAgentsOnStartup().catch((err) => {
      console.error("[startup] Agent sync failed:", err);
    });
  }
}

async function syncAllAgentsOnStartup() {
  try {
    const { prisma } = await import("./lib/prisma");
    const { syncRetellAgent } = await import("./lib/retell");

    const businesses = await prisma.business.findMany({
      where: { isActive: true },
      include: {
        services: { where: { isActive: true } },
        retellConfig: true,
        breedRecommendations: { orderBy: { priority: "desc" } },
      },
    });

    const withAgent = businesses.filter((b) => b.retellConfig?.agentId && b.retellConfig?.llmId);
    if (withAgent.length === 0) return;

    console.log(`[startup] Syncing ${withAgent.length} Retell agent(s)...`);
    const results = await Promise.allSettled(withAgent.map((b) => syncRetellAgent(b)));
    const failed = results.filter((r) => r.status === "rejected");
    if (failed.length > 0) {
      failed.forEach((r) => console.error("[startup] Sync failed:", (r as PromiseRejectedResult).reason));
    }
    console.log(`[startup] Agent sync complete: ${results.length - failed.length}/${results.length} succeeded.`);
  } catch (err) {
    console.error("[startup] syncAllAgentsOnStartup error:", err);
  }
}
