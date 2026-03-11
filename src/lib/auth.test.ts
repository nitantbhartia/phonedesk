import { beforeEach, describe, expect, it } from "vitest";
import { checkCredentialRateLimit } from "./auth";
import { resetRateLimits } from "./rate-limit";

describe("checkCredentialRateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
  });

  it("blocks the sixth credentials attempt from the same IP within the window", () => {
    const request = new Request("http://localhost/api/auth/callback/credentials", {
      headers: { "x-forwarded-for": "203.0.113.10" },
    });

    for (let i = 0; i < 5; i++) {
      expect(
        checkCredentialRateLimit("test@example.com", request).allowed
      ).toBe(true);
    }

    expect(
      checkCredentialRateLimit("test@example.com", request).allowed
    ).toBe(false);
  });
});
