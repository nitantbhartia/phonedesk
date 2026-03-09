import { afterEach, describe, expect, it, vi } from "vitest";
import Retell from "retell-sdk";
import { createHmac } from "crypto";
import { isRetellWebhookValid } from "./retell-auth";

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
});
