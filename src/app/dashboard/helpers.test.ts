import { describe, expect, it } from "vitest";

/**
 * These test the pure helper logic used by the dashboard page.
 * The functions are inlined in page.tsx (client component), so we
 * replicate them here to verify correctness.
 */

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}m ${s.toString().padStart(2, "0")}s`;
}

function weekOverWeekChange(thisWeek: number, lastWeek: number): number | null {
  if (lastWeek <= 0) return null;
  const pct = Math.round(((thisWeek - lastWeek) / lastWeek) * 100);
  return pct === 0 ? null : pct;
}

function bookingRate(confirmed: number, missed: number): number | null {
  const total = confirmed + missed;
  if (total <= 0) return null;
  return Math.round((confirmed / total) * 100);
}

describe("formatDuration", () => {
  it("formats seconds into minutes and seconds", () => {
    expect(formatDuration(0)).toBe("0m 00s");
    expect(formatDuration(59)).toBe("0m 59s");
    expect(formatDuration(60)).toBe("1m 00s");
    expect(formatDuration(90)).toBe("1m 30s");
    expect(formatDuration(125)).toBe("2m 05s");
    expect(formatDuration(3661)).toBe("61m 01s");
  });
});

describe("weekOverWeekChange", () => {
  it("returns null when last week had no calls", () => {
    expect(weekOverWeekChange(5, 0)).toBeNull();
  });

  it("returns null when change is exactly 0%", () => {
    expect(weekOverWeekChange(10, 10)).toBeNull();
  });

  it("returns positive percentage for growth", () => {
    expect(weekOverWeekChange(15, 10)).toBe(50);
  });

  it("returns negative percentage for decline", () => {
    expect(weekOverWeekChange(5, 10)).toBe(-50);
  });

  it("handles 100% growth (doubled)", () => {
    expect(weekOverWeekChange(20, 10)).toBe(100);
  });

  it("handles going from some calls to zero", () => {
    expect(weekOverWeekChange(0, 5)).toBe(-100);
  });
});

describe("bookingRate", () => {
  it("returns null when no calls at all", () => {
    expect(bookingRate(0, 0)).toBeNull();
  });

  it("returns 100% when all calls result in bookings", () => {
    expect(bookingRate(10, 0)).toBe(100);
  });

  it("returns 0% when no bookings confirmed", () => {
    expect(bookingRate(0, 5)).toBe(0);
  });

  it("calculates correct rate for mixed results", () => {
    expect(bookingRate(3, 7)).toBe(30);
    expect(bookingRate(4, 1)).toBe(80);
  });
});
