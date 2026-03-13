import { beforeEach, describe, expect, it, vi } from "vitest";
import { rateLimit, resetRateLimits } from "./rate-limit";

describe("rateLimit", () => {
  beforeEach(() => {
    resetRateLimits();
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-12T12:00:00.000Z"));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("allows requests up to the limit and reports remaining quota", () => {
    expect(rateLimit("demo", { limit: 2, windowMs: 1000 })).toEqual({
      allowed: true,
      remaining: 1,
    });
    expect(rateLimit("demo", { limit: 2, windowMs: 1000 })).toEqual({
      allowed: true,
      remaining: 0,
    });
    expect(rateLimit("demo", { limit: 2, windowMs: 1000 })).toEqual({
      allowed: false,
      remaining: 0,
    });
  });

  it("resets counts after the window expires", () => {
    rateLimit("demo", { limit: 1, windowMs: 1000 });
    expect(rateLimit("demo", { limit: 1, windowMs: 1000 }).allowed).toBe(false);

    vi.advanceTimersByTime(1001);

    expect(rateLimit("demo", { limit: 1, windowMs: 1000 })).toEqual({
      allowed: true,
      remaining: 0,
    });
  });
});
