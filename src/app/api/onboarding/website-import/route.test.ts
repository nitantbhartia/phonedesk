import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/website-import", () => ({
  importWebsiteDraft: vi.fn(),
}));

import { importWebsiteDraft } from "@/lib/website-import";
import { POST } from "./route";

describe("POST /api/onboarding/website-import", () => {
  const originalToggle = process.env.NEXT_PUBLIC_ENABLE_WEBSITE_IMPORT;

  beforeEach(() => {
    process.env.NEXT_PUBLIC_ENABLE_WEBSITE_IMPORT = "true";
    vi.mocked(importWebsiteDraft).mockReset();
  });

  afterAll(() => {
    process.env.NEXT_PUBLIC_ENABLE_WEBSITE_IMPORT = originalToggle;
  });

  it("returns 404 when the feature is disabled", async () => {
    process.env.NEXT_PUBLIC_ENABLE_WEBSITE_IMPORT = "false";

    const response = await POST(
      new Request("http://localhost/api/onboarding/website-import", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" }),
      }) as never
    );

    expect(response.status).toBe(404);
  });

  it("validates the request body", async () => {
    const response = await POST(
      new Request("http://localhost/api/onboarding/website-import", {
        method: "POST",
        body: JSON.stringify({}),
      }) as never
    );

    expect(response.status).toBe(400);
  });

  it("returns the imported draft when useful data is found", async () => {
    vi.mocked(importWebsiteDraft).mockResolvedValue({
      sourceUrl: "https://example.com",
      businessName: "Example Grooming",
      phone: "619-555-0100",
      services: [{ name: "Full Groom", price: "85", duration: "90" }],
      importedFields: ["businessName", "phone", "services"],
      inspectedPages: ["https://example.com"],
    });

    const response = await POST(
      new Request("http://localhost/api/onboarding/website-import", {
        method: "POST",
        body: JSON.stringify({ url: "example.com" }),
      }) as never
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      draft: {
        sourceUrl: "https://example.com",
        businessName: "Example Grooming",
        phone: "619-555-0100",
        services: [{ name: "Full Groom", price: "85", duration: "90" }],
        importedFields: ["businessName", "phone", "services"],
        inspectedPages: ["https://example.com"],
      },
    });
  });

  it("returns 422 when the scraper cannot find useful business data", async () => {
    vi.mocked(importWebsiteDraft).mockResolvedValue({
      sourceUrl: "https://example.com",
      services: [],
      importedFields: [],
      inspectedPages: ["https://example.com"],
    });

    const response = await POST(
      new Request("http://localhost/api/onboarding/website-import", {
        method: "POST",
        body: JSON.stringify({ url: "https://example.com" }),
      }) as never
    );

    expect(response.status).toBe(422);
  });
});
