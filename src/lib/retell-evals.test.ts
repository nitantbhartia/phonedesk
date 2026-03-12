import { describe, expect, it } from "vitest";
import { runRetellPolicyEvals } from "./retell-evals";

describe("runRetellPolicyEvals", () => {
  it("passes the core Retell trust-policy evals", () => {
    const results = runRetellPolicyEvals("https://phonedesk.up.railway.app");
    const failures = results.filter((result) => !result.passed);

    expect(failures).toEqual([]);
  });
});
