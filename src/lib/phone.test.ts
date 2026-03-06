import { describe, expect, it } from "vitest";
import { normalizePhoneNumber } from "./phone";

describe("normalizePhoneNumber", () => {
  it("normalizes US 10-digit numbers to E.164", () => {
    expect(normalizePhoneNumber("(619) 555-0100")).toBe("+16195550100");
  });

  it("normalizes US 11-digit numbers with leading 1", () => {
    expect(normalizePhoneNumber("1-619-555-0100")).toBe("+16195550100");
  });

  it("returns null for empty input", () => {
    expect(normalizePhoneNumber("")).toBeNull();
    expect(normalizePhoneNumber(null)).toBeNull();
    expect(normalizePhoneNumber(undefined)).toBeNull();
  });
});

