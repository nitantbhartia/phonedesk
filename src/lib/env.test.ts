import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("env validation", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "secret";
    process.env.GOOGLE_CLIENT_ID = "google-client";
    process.env.GOOGLE_CLIENT_SECRET = "google-secret";
    process.env.DATABASE_URL = "postgres://db";
    process.env.NODE_ENV = "development";
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
      appUrl: "http://localhost:3000",
    });
  });

  it("requires retell config in production", async () => {
    process.env.NODE_ENV = "production";
    delete process.env.RETELL_API_KEY;

    const { validateEnv } = await import("./env");

    expect(() => validateEnv()).toThrow("Missing required environment variable: RETELL_API_KEY");
  });
});
