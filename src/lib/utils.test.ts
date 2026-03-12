import { describe, expect, it } from "vitest";

import {
  cn,
  formatCurrency,
  formatDateTime,
  formatDuration,
  formatPhoneNumber,
} from "./utils";

describe("utils", () => {
  it("merges tailwind class names", () => {
    expect(cn("px-2", "px-4", "text-sm")).toBe("px-4 text-sm");
  });

  it("formats phone, currency, datetime, and duration helpers", () => {
    expect(formatPhoneNumber("16195550100")).toBe("(619) 555-0100");
    expect(formatCurrency(99)).toBe("$99.00");
    expect(formatDateTime("2026-03-12T18:30:00.000Z", "America/Los_Angeles")).toContain("Mar");
    expect(formatDuration(125)).toBe("2:05");
  });
});
