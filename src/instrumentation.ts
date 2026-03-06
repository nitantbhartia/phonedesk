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
  }
}
