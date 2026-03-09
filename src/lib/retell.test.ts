import { describe, expect, it } from "vitest";
import { buildAgentTools } from "./retell";

describe("buildAgentTools", () => {
  it("includes lookup_customer_context tool", () => {
    const tools = buildAgentTools("https://ringpaw.com");
    const lookupTool = tools.find((tool) => tool.name === "lookup_customer_context");

    expect(lookupTool).toBeTruthy();
    expect(lookupTool?.type).toBe("custom");
    expect(lookupTool?.url).toBe(
      "https://ringpaw.com/api/retell/lookup-customer"
    );
  });

  it("keeps booking and availability tools configured", () => {
    const tools = buildAgentTools("https://ringpaw.com");
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toContain("check_availability");
    expect(toolNames).toContain("book_appointment");
    expect(toolNames).toContain("end_call");
  });
});

