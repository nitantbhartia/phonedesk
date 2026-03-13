import { afterEach, describe, expect, it, vi } from "vitest";
import Retell from "retell-sdk";
import { createHmac } from "crypto";
import {
  buildRetellWebhookUrl,
  isRetellAuthorized,
  isRetellWebhookValid,
} from "./retell-auth";

describe("isRetellWebhookValid", () => {
  const originalEnv = { ...process.env };

  afterEach(() => {
    vi.restoreAllMocks();
    process.env = { ...originalEnv };
  });

  it("accepts signatures generated with RETELL_WEBHOOK_SECRET", () => {
    process.env.RETELL_API_KEY = "key_aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    process.env.RETELL_WEBHOOK_SECRET = "whsec_bbbbbbbbbbbbbbbbbbbbbbbb";

    const body = JSON.stringify({ event: "call_ended", call: { call_id: "call_1" } });
    const timestamp = Date.now();
    const digest = createHmac("sha256", process.env.RETELL_WEBHOOK_SECRET)
      .update(body + timestamp)
      .digest("hex");
    const signature = `v=${timestamp},d=${digest}`;

    expect(isRetellWebhookValid(body, signature)).toBe(true);
  });

  it("falls back to plain-body webhook secret signatures", () => {
    process.env.RETELL_API_KEY = "key_aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    process.env.RETELL_WEBHOOK_SECRET = "whsec_bbbbbbbbbbbbbbbbbbbbbbbb";

    const body = JSON.stringify({ args: { service_name: "Bath" } });
    const signature = createHmac("sha256", process.env.RETELL_WEBHOOK_SECRET)
      .update(body)
      .digest("hex");

    expect(isRetellWebhookValid(body, signature)).toBe(true);
  });

  it("still uses the SDK verification path for RETELL_API_KEY", () => {
    process.env.RETELL_API_KEY = "key_aaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    process.env.RETELL_WEBHOOK_SECRET = "";

    const verifySpy = vi.spyOn(Retell, "verify").mockReturnValue(true);

    expect(isRetellWebhookValid("{}", "v=1,d=test")).toBe(true);
    expect(verifySpy).toHaveBeenCalledWith("{}", process.env.RETELL_API_KEY, "v=1,d=test");
  });

  it("accepts literal header auth when RETELL_WEBHOOK_SECRET is configured", () => {
    process.env.RETELL_WEBHOOK_SECRET = "retell-secret";

    expect(
      isRetellAuthorized(
        new Request("http://localhost", {
          headers: { authorization: "Bearer retell-secret" },
        })
      )
    ).toBe(true);
    expect(
      isRetellAuthorized(
        new Request("http://localhost", {
          headers: { "x-retell-secret": "retell-secret" },
        })
      )
    ).toBe(true);
  });

  it("rejects missing auth in production and builds webhook urls safely", () => {
    process.env.RETELL_WEBHOOK_SECRET = "";
    process.env.NODE_ENV = "production";

    expect(isRetellAuthorized(new Request("http://localhost"))).toBe(false);
    expect(buildRetellWebhookUrl("https://app.test/", "api/sms/webhook")).toBe(
      "https://app.test/api/sms/webhook"
    );
  });
});
