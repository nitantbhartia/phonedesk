// Runtime environment variable validation.
// Import this in layout.tsx or middleware to fail fast on missing config.

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Missing required environment variable: ${name}. Check your .env file.`
    );
  }
  return value;
}

function optional(name: string, fallback: string): string {
  return process.env[name] || fallback;
}

export function validateEnv() {
  // Auth
  const secret = process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret) {
    throw new Error(
      "Missing NEXTAUTH_SECRET or AUTH_SECRET. Set one in your .env file."
    );
  }

  required("GOOGLE_CLIENT_ID");
  required("GOOGLE_CLIENT_SECRET");
  required("DATABASE_URL");

  // Retell (optional in dev, required in prod)
  if (process.env.NODE_ENV === "production") {
    required("RETELL_API_KEY");
    required("NEXT_PUBLIC_APP_URL");
  }

  return {
    secret,
    googleClientId: required("GOOGLE_CLIENT_ID"),
    googleClientSecret: required("GOOGLE_CLIENT_SECRET"),
    databaseUrl: required("DATABASE_URL"),
    retellApiKey: optional("RETELL_API_KEY", ""),
    appUrl: optional("NEXT_PUBLIC_APP_URL", "http://localhost:3000"),
    cronSecret: optional("CRON_SECRET", ""),
    adminSecret: optional("ADMIN_SECRET", ""),
    stripeSecretKey: optional("STRIPE_SECRET_KEY", ""),
    stripeWebhookSecret: optional("STRIPE_WEBHOOK_SECRET", ""),
    stripeStarterPriceId: optional("STRIPE_STARTER_PRICE_ID", ""),
    stripeProPriceId: optional("STRIPE_PRO_PRICE_ID", ""),
    stripeBusinessPriceId: optional("STRIPE_BUSINESS_PRICE_ID", ""),
    // Set STRIPE_BYPASS=true to skip all subscription checks (for testing in prod)
    stripeBypass: process.env.STRIPE_BYPASS === "true",
  };
}
