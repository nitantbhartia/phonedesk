import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("env validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "secret";
    process.env.GOOGLE_CLIENT_ID = "google-client";
    process.env.GOOGLE_CLIENT_SECRET = "google-secret";
    process.env.DATABASE_URL = "postgres://db";
    process.env.NODE_ENV = "development";
    delete process.env.NEXTAUTH_URL;
    delete process.env.NEXT_PUBLIC_APP_URL;
    delete process.env.BLAND_API_KEY;
    delete process.env.BLAND_ENCRYPTED_TWILIO_KEY;
    delete process.env.BLAND_TOOL_SECRET;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("returns normalized env values when required vars exist", async () => {
    const { validateEnv } = await import("./env");

    expect(validateEnv()).toMatchObject({
      secret: "secret",
      googleClientId: "google-client",
      googleClientSecret: "google-secret",
      databaseUrl: "postgres://db",
      appUrl: "https://ringpaw.com",
      blandApiKey: "",
      blandEncryptedTwilioKey: "",
      blandToolSecret: "",
    });
  });

  it("does not require Retell config in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.RETELL_API_KEY;

    const { validateEnv } = await import("./env");

    expect(() => validateEnv()).not.toThrow();
  });

  it("does not require Bland config to boot", async () => {
    const { validateEnv } = await import("./env");
    const env = validateEnv();

    expect(env.blandApiKey).toBe("");
    expect(env.blandEncryptedTwilioKey).toBe("");
    expect(env.blandToolSecret).toBe("");
  });
});
