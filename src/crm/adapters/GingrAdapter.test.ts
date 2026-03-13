import { describe, expect, it } from "vitest";

import { GingrAdapter } from "./GingrAdapter";

describe("GingrAdapter", () => {
  it("reports its crm type and throws for unimplemented methods", async () => {
    const adapter = new GingrAdapter("token", "acct_1");

    expect(adapter.getCRMType()).toBe("gingr");
    await expect(adapter.getServices()).rejects.toThrow("not implemented");
  });
});
