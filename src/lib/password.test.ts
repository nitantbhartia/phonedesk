import { describe, expect, it } from "vitest";

import {
  PASSWORD_REQUIREMENTS,
  hashPassword,
  isPasswordStrongEnough,
  verifyPassword,
} from "./password";

describe("password helpers", () => {
  it("hashes and verifies passwords", () => {
    const hash = hashPassword("StrongPassword123");

    expect(verifyPassword("StrongPassword123", hash)).toBe(true);
    expect(verifyPassword("WrongPassword123", hash)).toBe(false);
  });

  it("enforces password strength requirements", () => {
    expect(isPasswordStrongEnough("short")).toBe(false);
    expect(isPasswordStrongEnough("alllowercase123")).toBe(false);
    expect(isPasswordStrongEnough("StrongPassword123")).toBe(true);
    expect(PASSWORD_REQUIREMENTS).toContain("At least 12 characters");
  });
});
