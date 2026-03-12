import { afterEach, describe, expect, it, vi } from "vitest";

import { verifyCronAuth } from "./cron-auth";

describe("cron-auth", () => {
  const originalSecret = process.env.CRON_SECRET;
  const originalNodeEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("allows requests in development when no CRON_SECRET is set", () => {
    delete process.env.CRON_SECRET;
    process.env.NODE_ENV = "development";

    expect(verifyCronAuth(new Request("http://localhost") as never)).toBeNull();
  });

  it("rejects production requests when the secret is missing", async () => {
    delete process.env.CRON_SECRET;
    process.env.NODE_ENV = "production";

    const response = verifyCronAuth(new Request("http://localhost") as never);

    expect(response?.status).toBe(401);
    await expect(response?.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("requires the matching bearer token when configured", async () => {
    process.env.CRON_SECRET = "secret";

    const bad = verifyCronAuth(new Request("http://localhost", {
      headers: { authorization: "Bearer nope" },
    }) as never);
    const good = verifyCronAuth(new Request("http://localhost", {
      headers: { authorization: "Bearer secret" },
    }) as never);

    expect(bad?.status).toBe(401);
    expect(good).toBeNull();
  });
});
