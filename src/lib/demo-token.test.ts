import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { issueDemoToken, verifyDemoToken } from "./demo-token";

describe("demo-token", () => {
  const originalSecret = process.env.DEMO_TOKEN_SECRET;

  beforeEach(() => {
    process.env.DEMO_TOKEN_SECRET = "super-secret";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T18:00:00.000Z"));
  });

  afterEach(() => {
    process.env.DEMO_TOKEN_SECRET = originalSecret;
  });

  it("issues and verifies a signed token", () => {
    const token = issueDemoToken("lead_1");

    expect(verifyDemoToken(token)).toMatchObject({ leadId: "lead_1" });
  });

  it("rejects tampered tokens", () => {
    const token = issueDemoToken("lead_1");
    const tampered = `x${token.slice(1)}`;

    expect(verifyDemoToken(tampered)).toBeNull();
  });
});
