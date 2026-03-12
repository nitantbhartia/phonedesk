import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./prisma", () => ({
  prisma: {
    retellConfig: {
      update: vi.fn(),
      upsert: vi.fn(),
    },
  },
}));

import { prisma } from "./prisma";
import {
  buildAgentConfig,
  buildAgentTools,
  generateSystemPrompt,
  refreshRetellLLMForCall,
  syncRetellAgent,
} from "./retell";

describe("buildAgentTools", () => {
  it("includes lookup_customer_context tool", () => {
    const tools = buildAgentTools("https://phonedesk.up.railway.app");
    const lookupTool = tools.find((tool) => tool.name === "lookup_customer_context");

    expect(lookupTool).toBeTruthy();
    expect(lookupTool?.type).toBe("custom");
    expect(lookupTool?.url).toBe(
      "https://phonedesk.up.railway.app/api/retell/lookup-customer"
    );
  });

  it("keeps booking and availability tools configured", () => {
    const tools = buildAgentTools("https://phonedesk.up.railway.app");
    const toolNames = tools.map((tool) => tool.name);

    expect(toolNames).toContain("check_availability");
    expect(toolNames).toContain("book_appointment");
    expect(toolNames).toContain("reschedule_appointment");
    expect(toolNames).toContain("join_waitlist");
    expect(toolNames).toContain("business_faq");
    expect(toolNames).toContain("appointment_status");
    expect(toolNames).toContain("get_services");
    expect(toolNames).toContain("add_call_note");
    expect(toolNames).toContain("end_call");
  });

  it("strengthens availability and booking tool guidance", () => {
    const tools = buildAgentTools("https://phonedesk.up.railway.app");
    const availabilityTool = tools.find((tool) => tool.name === "check_availability");
    const bookingTool = tools.find((tool) => tool.name === "book_appointment");
    const cancelTool = tools.find((tool) => tool.name === "cancel_appointment");
    const callNoteTool = tools.find((tool) => tool.name === "add_call_note");
    const statusTool = tools.find((tool) => tool.name === "appointment_status");

    expect(
      availabilityTool?.parameters?.properties.service_id.description
    ).toContain("exact service_id");
    expect(availabilityTool?.parameters?.required).toContain("service_id");
    expect(
      bookingTool?.parameters?.properties.start_time.description
    ).toContain("Use the exact start_time returned by check_availability");
    expect(bookingTool?.parameters?.required).toContain("service_id");
    expect(cancelTool?.parameters?.properties).toHaveProperty("appointment_id");
    expect(callNoteTool?.parameters?.properties.outcome.enum).toContain("rescheduled");
    expect(statusTool?.description).toContain("never be used to guess from a future appointment");
  });
});

describe("generateSystemPrompt", () => {
  it("keeps the booking sequence linear and adds repair guidance", () => {
    const prompt = generateSystemPrompt({
      id: "biz_1",
      name: "Paw House",
      ownerName: "Taylor",
      address: "123 Main St",
      city: "San Diego",
      bookingMode: "SOFT",
      businessHours: { mon: { open: "9:00 AM", close: "5:00 PM" } },
      services: [
        {
          id: "svc_1",
          businessId: "biz_1",
          name: "Full Groom",
          price: 95,
          duration: 90,
          isActive: true,
          isAddon: false,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "svc_2",
          businessId: "biz_1",
          name: "Teeth Brushing",
          price: 20,
          duration: 10,
          isActive: true,
          isAddon: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      breedRecommendations: [],
      groomers: [],
    } as never);

    expect(prompt.indexOf("STEP 5 — UPSELL ADD-ON")).toBeLessThan(
      prompt.indexOf("STEP 6 — BOOK APPOINTMENT")
    );
    expect(prompt).toContain("STEP 2A — IDENTIFY THE CALLER'S INTENT BEFORE BOOKING");
    expect(prompt).toContain("Never guess the service");
    expect(prompt).toContain("carry that exact service_id into later tool calls");
    expect(prompt).toContain("If availability or service matching comes back unclear");
    expect(prompt).toContain("address it directly without restarting the booking flow");
    expect(prompt).toContain("Never handle a reschedule by separately calling cancel_appointment and then book_appointment");
  });

  it("adds ambiguity, latency, and booking-mode guidance", () => {
    const hardPrompt = generateSystemPrompt({
      id: "biz_2",
      name: "Clip Joint",
      ownerName: "Morgan",
      address: null,
      city: "Los Angeles",
      bookingMode: "HARD",
      businessHours: null,
      services: [],
      breedRecommendations: [],
      groomers: [],
    } as never);

    const softPrompt = generateSystemPrompt({
      id: "biz_3",
      name: "Bath Club",
      ownerName: "Jordan",
      address: null,
      city: "San Francisco",
      bookingMode: "SOFT",
      businessHours: null,
      services: [],
      breedRecommendations: [],
      groomers: [],
    } as never);

    expect(hardPrompt).toContain('Thanks for holding —');
    expect(hardPrompt).toContain('Did you mean today, or next Monday?');
    expect(hardPrompt).toContain('Let me get that booked for you right now.');
    expect(softPrompt).toContain("owner will send you a confirmation shortly");
    expect(softPrompt).toContain("Jordan will confirm it with you");
    expect(softPrompt).not.toContain("fully booked right now");
    expect(hardPrompt).toContain("If you are not fully sure which appointment they mean");
    expect(hardPrompt).toContain("If you do not have enough detail to ask a useful clarifying question yet");
    expect(hardPrompt).toContain("prioritize speed over rapport");
    expect(hardPrompt).toContain("call appointment_status");
    expect(hardPrompt).toContain("Do not switch to a future appointment");
    expect(hardPrompt).toContain("call business_faq");
    expect(hardPrompt).toContain("call join_waitlist");
  });
});

describe("buildAgentConfig", () => {
  it("wires the webhook and tools off the app base url", () => {
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";

    const config = buildAgentConfig({
      id: "biz_1",
      name: "Paw House",
      ownerName: "Taylor",
      address: "123 Main St",
      city: "San Diego",
      businessHours: { mon: { open: "9:00 AM", close: "5:00 PM" } },
      services: [
        {
          id: "svc_1",
          businessId: "biz_1",
          name: "Full Groom",
          price: 95,
          duration: 90,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      breedRecommendations: [],
      groomers: [],
    } as never);

    expect(config.webhookUrl).toBe("https://app.example.com/api/retell/webhook");
    const lookupTool = config.tools.find((tool) => tool.name === "lookup_customer_context");
    expect(config.tools.map((tool) => tool.name)).toContain("get_current_datetime");
    expect(lookupTool?.url).toBe(
      "https://app.example.com/api/retell/lookup-customer"
    );
  });
});

describe("refreshRetellLLMForCall", () => {
  beforeEach(() => {
    process.env.RETELL_API_KEY = "test-key";
    vi.restoreAllMocks();
  });

  it("injects the current date into the prompt and updates the llm", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ general_prompt: "IDENTITY & ROLE\nHello" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response);

    await refreshRetellLLMForCall("llm_1", "America/Los_Angeles");

    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.retellai.com/get-retell-llm/llm_1",
      expect.objectContaining({
        method: "GET",
        headers: expect.objectContaining({
          Authorization: "Bearer test-key",
        }),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.retellai.com/update-retell-llm/llm_1",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining("Today's date:"),
      })
    );
  });
});

describe("syncRetellAgent", () => {
  beforeEach(() => {
    process.env.RETELL_API_KEY = "test-key";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
    vi.mocked(prisma.retellConfig.update).mockReset();
    vi.mocked(prisma.retellConfig.upsert).mockReset();
  });

  it("updates an existing agent and preserves a custom greeting", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({}),
      } as Response);
    vi.mocked(prisma.retellConfig.update).mockResolvedValue({ id: "cfg_1" } as never);

    await syncRetellAgent({
      id: "biz_1",
      name: "Paw House",
      ownerName: "Taylor",
      address: "123 Main St",
      city: "San Diego",
      businessHours: { mon: { open: "9:00 AM", close: "5:00 PM" } },
      services: [
        {
          id: "svc_1",
          businessId: "biz_1",
          name: "Full Groom",
          price: 95,
          duration: 90,
          isActive: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
      breedRecommendations: [],
      groomers: [],
      retellConfig: {
        businessId: "biz_1",
        agentId: "agent_1",
        llmId: "llm_1",
        greeting: "Custom hello",
      },
    } as never);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.retellai.com/update-retell-llm/llm_1",
      expect.objectContaining({
        method: "PATCH",
        body: expect.stringContaining("Custom hello"),
      })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.retellai.com/update-agent/agent_1",
      expect.objectContaining({
        method: "PATCH",
      })
    );
    expect(prisma.retellConfig.update).toHaveBeenCalledWith({
      where: { businessId: "biz_1" },
      data: expect.objectContaining({
        agentId: "agent_1",
        llmId: "llm_1",
        greeting: "Custom hello",
      }),
    });
  });

  it("creates llm and agent records for a new business", async () => {
    const fetchMock = vi
      .spyOn(global, "fetch")
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ llm_id: "llm_new" }),
      } as Response)
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({ agent_id: "agent_new" }),
      } as Response);
    vi.mocked(prisma.retellConfig.upsert).mockResolvedValue({ id: "cfg_2" } as never);

    await syncRetellAgent({
      id: "biz_2",
      name: "Clip Joint",
      ownerName: "Morgan",
      address: null,
      city: "Los Angeles",
      businessHours: null,
      services: [],
      breedRecommendations: [],
      groomers: [],
      retellConfig: null,
    } as never);

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "https://api.retellai.com/create-retell-llm",
      expect.objectContaining({ method: "POST" })
    );
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.retellai.com/create-agent",
      expect.objectContaining({ method: "POST" })
    );
    expect(prisma.retellConfig.upsert).toHaveBeenCalledWith({
      where: { businessId: "biz_2" },
      create: expect.objectContaining({
        businessId: "biz_2",
        agentId: "agent_new",
        llmId: "llm_new",
      }),
      update: expect.objectContaining({
        agentId: "agent_new",
        llmId: "llm_new",
      }),
    });
  });
});
