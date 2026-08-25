// Next.js instrumentation hook — runs once when the server starts.
// See: https://nextjs.org/docs/app/building-your-application/optimizing/instrumentation

export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    // Global crash handlers so Railway logs show the reason before the process dies.
    process.on("uncaughtException", (err) => {
      const mem = process.memoryUsage();
      process.stderr.write(
        `[crash] uncaughtException: ${err?.stack || err}\nheap: ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB rss: ${Math.round(mem.rss / 1024 / 1024)}MB\n`,
      );
      process.exit(1);
    });
    process.on("unhandledRejection", (reason) => {
      const mem = process.memoryUsage();
      process.stderr.write(
        `[crash] unhandledRejection: ${reason instanceof Error ? reason.stack : String(reason)}\nheap: ${Math.round(mem.heapUsed / 1024 / 1024)}MB / ${Math.round(mem.heapTotal / 1024 / 1024)}MB rss: ${Math.round(mem.rss / 1024 / 1024)}MB\n`,
      );
      process.exit(1);
    });

    const { validateEnv } = await import("./lib/env");
    try {
      validateEnv();
    } catch (error) {
      console.error("[env]", error instanceof Error ? error.message : error);
      // Don't crash the process — log the warning so deploy logs show it
    }

    // Keep the shared Twilio number configured after every deploy. This is
    // best-effort so a missing Twilio account cannot prevent the app booting.
    ensureTwilioNumberOnStartup().catch((err) => {
      console.error("[startup] Twilio webhook sync failed:", err);
    });
  }
}

async function ensureTwilioNumberOnStartup() {
  const number = process.env.TWILIO_PHONE_NUMBER?.trim();
  if (
    !number ||
    !process.env.TWILIO_ACCOUNT_SID ||
    !process.env.TWILIO_AUTH_TOKEN
  ) {
    return;
  }

  const { ensureTwilioWebhooks } = await import("./lib/twilio-rest");
  await ensureTwilioWebhooks(number);
}
