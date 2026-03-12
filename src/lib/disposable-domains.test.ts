import { describe, expect, it } from "vitest";

import { isDisposableEmail, isValidBusinessEmail } from "./disposable-domains";

describe("disposable-domains", () => {
  it("detects disposable domains", () => {
    expect(isDisposableEmail("test@mailinator.com")).toBe(true);
    expect(isDisposableEmail("owner@pawhouse.com")).toBe(false);
  });

  it("accepts normal business emails and rejects malformed/disposable ones", () => {
    expect(isValidBusinessEmail("owner@pawhouse.com")).toBe(true);
    expect(isValidBusinessEmail("owner@mailinator.com")).toBe(false);
    expect(isValidBusinessEmail("not-an-email")).toBe(false);
  });
});
