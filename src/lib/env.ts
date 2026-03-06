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
  };
}
