import { beforeEach, describe, expect, it, vi } from "vitest";

import { MoeGoAdapter } from "./MoeGoAdapter";

describe("MoeGoAdapter", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("reports its crm type", () => {
    const adapter = new MoeGoAdapter("api_key");

    expect(adapter.getCRMType()).toBe("moego");
  });

  it("returns false from healthCheck when the API request fails", async () => {
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: false,
      status: 500,
    } as never);
    const adapter = new MoeGoAdapter("api_key");

    await expect(adapter.healthCheck()).resolves.toBe(false);
  });
});
