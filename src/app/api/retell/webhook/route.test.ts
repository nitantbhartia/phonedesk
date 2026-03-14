import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/prisma", () => ({
  prisma: {
    phoneNumber: {
      findFirst: vi.fn(),
    },
    publicDemoAttempt: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    demoLead: {
      update: vi.fn(),
    },
    business: {
      findUnique: vi.fn(),
    },
    call: {
      upsert: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
  },
}));

vi.mock("@/lib/customer-memory", () => ({
  lookupCustomerContext: vi.fn(),
  upsertCustomerMemoryFromCall: vi.fn(),
}));

vi.mock("@/lib/retell", () => ({
  refreshRetellLLMForCall: vi.fn(),
}));

vi.mock("@/lib/notifications", () => ({
  sendMissedCallNotification: vi.fn(),
}));

vi.mock("@/lib/retell-auth", () => ({
  isRetellWebhookValid: vi.fn(),
}));

vi.mock("@/lib/demo-session", () => ({
  resolveBusinessFromDemo: vi.fn(async () => null),
  resolveDemoSession: vi.fn(async () => null),
}));

import { POST } from "./route";
import { prisma } from "@/lib/prisma";
import {
  lookupCustomerContext,
  upsertCustomerMemoryFromCall,
} from "@/lib/customer-memory";
import { refreshRetellLLMForCall } from "@/lib/retell";
import { sendMissedCallNotification } from "@/lib/notifications";
import { isRetellWebhookValid } from "@/lib/retell-auth";
import { resolveDemoSession } from "@/lib/demo-session";

function makeRequest(body: unknown, signature = "sig") {
  return new Request("http://localhost/api/retell/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-retell-signature": signature },
    body: JSON.stringify(body),
  });
}

describe("POST /api/retell/webhook", () => {
  beforeEach(() => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(true);
    vi.mocked(prisma.phoneNumber.findFirst).mockReset();
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockReset();
    vi.mocked(prisma.publicDemoAttempt.update).mockReset();
    vi.mocked(prisma.demoLead.update).mockReset();
    vi.mocked(prisma.business.findUnique).mockReset();
    vi.mocked(prisma.call.upsert).mockReset();
    vi.mocked(prisma.call.findUnique).mockReset();
    vi.mocked(prisma.call.update).mockReset();
    vi.mocked(prisma.call.create).mockReset();
    vi.mocked(lookupCustomerContext).mockReset();
    vi.mocked(upsertCustomerMemoryFromCall).mockReset();
    vi.mocked(refreshRetellLLMForCall).mockReset();
    vi.mocked(sendMissedCallNotification).mockReset();
    vi.mocked(resolveDemoSession).mockReset();
  });

  it("rejects unauthorized webhook requests", async () => {
    vi.mocked(isRetellWebhookValid).mockReturnValue(false);

    const response = await POST(
      makeRequest({ event: "call_started", call: { call_id: "call_1" } }) as never
    );

    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toEqual({ error: "Unauthorized" });
  });

  it("stores in-progress calls and refreshes the retell llm on call_started", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      businessId: "biz_1",
      business: {
        timezone: "America/Los_Angeles",
        retellConfig: { llmId: "llm_123" },
      },
    } as never);
    vi.mocked(prisma.business.findUnique).mockResolvedValue({
      onboardingComplete: true,
    } as never);
    vi.mocked(lookupCustomerContext).mockResolvedValue({
      customer: { name: "Sarah" },
    } as never);

    const response = await POST(
      makeRequest({
        event: "call_started",
        call: {
          call_id: "call_1",
          from_number: "(619) 555-0100",
          to_number: "+1 (619) 555-9999",
        },
      }) as never
    );

    expect(response.status).toBe(204);
    expect(lookupCustomerContext).toHaveBeenCalledWith("biz_1", "+16195550100");
    expect(prisma.call.upsert).toHaveBeenCalledWith({
      where: { retellCallId: "call_1" },
      create: {
        businessId: "biz_1",
        retellCallId: "call_1",
        callerPhone: "+16195550100",
        callerName: "Sarah",
        status: "IN_PROGRESS",
        isTestCall: false,
      },
      update: {
        status: "IN_PROGRESS",
        callerName: "Sarah",
        callerPhone: "+16195550100",
        isTestCall: false,
      },
    });
    expect(refreshRetellLLMForCall).toHaveBeenCalledWith(
      "llm_123",
      "America/Los_Angeles"
    );
  });

  it("treats public demo callers as new, records the caller phone, and starts cooldown on call_started", async () => {
    vi.mocked(resolveDemoSession).mockResolvedValue({
      businessId: "demo_biz",
      source: "public",
      demoNumberId: "demo_num_1",
      publicAttemptId: "attempt_1",
      leadId: "lead_1",
      callerPhone: null,
    });
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.business.findUnique)
      .mockResolvedValueOnce({
        id: "demo_biz",
        timezone: "America/Los_Angeles",
        retellConfig: { llmId: "llm_demo" },
      } as never)
      .mockResolvedValueOnce({
        onboardingComplete: true,
      } as never);
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.publicDemoAttempt.update).mockResolvedValue({ id: "attempt_1" } as never);
    vi.mocked(prisma.demoLead.update).mockResolvedValue({ id: "lead_1" } as never);

    const response = await POST(
      makeRequest({
        event: "call_started",
        call: {
          call_id: "call_demo_1",
          from_number: "(619) 555-0100",
          to_number: "+1 (716) 576-3523",
        },
      }) as never
    );

    expect(response.status).toBe(204);
    expect(lookupCustomerContext).not.toHaveBeenCalled();
    expect(prisma.publicDemoAttempt.update).toHaveBeenCalledWith({
      where: { id: "attempt_1" },
      data: { callerPhone: "+16195550100" },
    });
    expect(prisma.demoLead.update).toHaveBeenCalledWith({
      where: { id: "lead_1" },
      data: { cooldownUntil: expect.any(Date) },
    });
    expect(prisma.call.upsert).toHaveBeenCalledWith({
      where: { retellCallId: "call_demo_1" },
      create: {
        businessId: "demo_biz",
        retellCallId: "call_demo_1",
        callerPhone: "+16195550100",
        callerName: null,
        status: "IN_PROGRESS",
        isTestCall: true,
      },
      update: {
        status: "IN_PROGRESS",
        callerName: null,
        callerPhone: "+16195550100",
        isTestCall: true,
      },
    });
  });

  it("creates a completed call with computed duration on call_ended when no record exists", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: { id: "biz_1", phoneNumber: { number: "+16195559999" } },
    } as never);
    vi.mocked(prisma.call.findUnique).mockResolvedValue(null);

    const response = await POST(
      makeRequest({
        event: "call_ended",
        call: {
          call_id: "call_2",
          from_number: "+16195550100",
          to_number: "+16195559999",
          transcript: "Customer asked about a bath.",
          recording_url: "https://example.com/recording.mp3",
          start_timestamp: 1000,
          end_timestamp: 91000,
        },
      }) as never
    );

    expect(response.status).toBe(204);
    expect(prisma.call.create).toHaveBeenCalledWith({
      data: {
        businessId: "biz_1",
        retellCallId: "call_2",
        callerPhone: "+16195550100",
        duration: 90,
        transcript: "Customer asked about a bath.",
        status: "COMPLETED",
        recordingUrl: "https://example.com/recording.mp3",
      },
    });
  });

  it("updates analyzed calls, writes customer memory, and triggers missed-call recovery when no booking exists", async () => {
    vi.mocked(prisma.call.findUnique)
      .mockResolvedValueOnce({
        id: "db_call_1",
        businessId: "biz_1",
        retellCallId: "call_3",
        callerName: "Prefilled Name",
        callerPhone: "+16195550100",
        appointmentId: null,
        status: "COMPLETED",
      } as never)
      .mockResolvedValueOnce({
        id: "db_call_1",
        businessId: "biz_1",
        retellCallId: "call_3",
        callerName: "Jamie",
        callerPhone: "+16195550100",
        appointmentId: null,
        status: "COMPLETED",
        business: {
          id: "biz_1",
          name: "Paw House",
          phone: "+16195550000",
          phoneNumber: { number: "+16195559999" },
        },
      } as never);

    const response = await POST(
      makeRequest({
        event: "call_analyzed",
        call: {
          call_id: "call_3",
          from_number: "(619) 555-0100",
          call_analysis: {
            call_summary: "Customer asked for pricing and will call back.",
            custom_analysis_data: {
              customer_name: "Jamie",
              pet_name: "Buddy",
              pet_breed: "Poodle",
              pet_size: "MEDIUM",
              service_name: "Bath",
              notes: "Sensitive paws",
            },
          },
        },
      }) as never
    );

    expect(response.status).toBe(204);
    expect(prisma.call.update).toHaveBeenNthCalledWith(1, {
      where: { retellCallId: "call_3" },
      data: {
        summary: "Customer asked for pricing and will call back.",
        callerName: "Jamie",
        extractedData: {
          customer_name: "Jamie",
          pet_name: "Buddy",
          pet_breed: "Poodle",
          pet_size: "MEDIUM",
          service_name: "Bath",
          notes: "Sensitive paws",
        },
      },
    });
    expect(upsertCustomerMemoryFromCall).toHaveBeenCalledWith({
      businessId: "biz_1",
      customerName: "Jamie",
      customerPhone: "+16195550100",
      petName: "Buddy",
      petBreed: "Poodle",
      petSize: "MEDIUM",
      serviceName: "Bath",
      summary: "Customer asked for pricing and will call back.",
      notes: "Sensitive paws",
      outcome: "NO_BOOKING",
      contactedAt: expect.any(Date),
    });
    expect(prisma.call.update).toHaveBeenNthCalledWith(2, {
      where: { id: "db_call_1" },
      data: { status: "NO_BOOKING" },
    });
    expect(sendMissedCallNotification).toHaveBeenCalledWith(
      {
        id: "biz_1",
        name: "Paw House",
        phone: "+16195550000",
        phoneNumber: { number: "+16195559999" },
      },
      "(619) 555-0100",
      "Jamie"
    );
  });

  it("does not send missed-call recovery for analyzed calls already linked to an appointment", async () => {
    vi.mocked(prisma.call.findUnique)
      .mockResolvedValueOnce({
        id: "db_call_2",
        businessId: "biz_1",
        retellCallId: "call_4",
        callerName: "Alex",
        callerPhone: "+16195550101",
        appointmentId: "appt_1",
        status: "COMPLETED",
      } as never)
      .mockResolvedValueOnce({
        id: "db_call_2",
        businessId: "biz_1",
        retellCallId: "call_4",
        callerName: "Alex",
        callerPhone: "+16195550101",
        appointmentId: "appt_1",
        status: "COMPLETED",
        business: {
          id: "biz_1",
          name: "Paw House",
          phone: "+16195550000",
          phoneNumber: { number: "+16195559999" },
        },
      } as never);

    await POST(
      makeRequest({
        event: "call_analyzed",
        call: {
          call_id: "call_4",
          from_number: "+16195550101",
          call_analysis: {
            call_summary: "Booked successfully.",
            custom_analysis_data: {
              customer_name: "Alex",
            },
          },
        },
      }) as never
    );

    expect(upsertCustomerMemoryFromCall).toHaveBeenCalledWith(
      expect.objectContaining({
        outcome: "BOOKED",
      })
    );
    expect(sendMissedCallNotification).not.toHaveBeenCalled();
  });

  it("does not write customer memory for analyzed demo/test calls", async () => {
    vi.mocked(prisma.call.findUnique)
      .mockResolvedValueOnce({
        id: "db_call_demo",
        businessId: "demo_biz",
        retellCallId: "call_demo_2",
        callerName: null,
        callerPhone: "+16195550100",
        appointmentId: null,
        status: "COMPLETED",
        isTestCall: true,
      } as never)
      .mockResolvedValueOnce({
        id: "db_call_demo",
        businessId: "demo_biz",
        retellCallId: "call_demo_2",
        callerName: "Jamie",
        callerPhone: "+16195550100",
        appointmentId: null,
        status: "COMPLETED",
        isTestCall: true,
        business: {
          id: "demo_biz",
          name: "Demo Biz",
          phone: "+16195550000",
          phoneNumber: { number: "+17165763523" },
        },
      } as never);

    const response = await POST(
      makeRequest({
        event: "call_analyzed",
        call: {
          call_id: "call_demo_2",
          from_number: "+16195550100",
          call_analysis: {
            call_summary: "Demo caller asked for a bath.",
            custom_analysis_data: {
              customer_name: "Jamie",
            },
          },
        },
      }) as never
    );

    expect(response.status).toBe(204);
    expect(upsertCustomerMemoryFromCall).not.toHaveBeenCalled();
    expect(sendMissedCallNotification).not.toHaveBeenCalled();
  });

  it("uses the customer number for outbound analyzed calls", async () => {
    vi.mocked(prisma.call.findUnique)
      .mockResolvedValueOnce({
        id: "db_call_outbound",
        businessId: "biz_1",
        retellCallId: "call_outbound",
        callerName: "Jamie",
        callerPhone: "+16195550100",
        appointmentId: null,
        status: "COMPLETED",
        isTestCall: false,
      } as never)
      .mockResolvedValueOnce({
        id: "db_call_outbound",
        businessId: "biz_1",
        retellCallId: "call_outbound",
        callerName: "Jamie",
        callerPhone: "+16195550100",
        appointmentId: null,
        status: "COMPLETED",
        isTestCall: false,
        business: {
          id: "biz_1",
          name: "Paw House",
          phone: "+16195550000",
          phoneNumber: { number: "+16195559999" },
        },
      } as never);

    const response = await POST(
      makeRequest({
        event: "call_analyzed",
        call: {
          call_id: "call_outbound",
          direction: "outbound",
          from_number: "+16195559999",
          to_number: "+16195550100",
          call_analysis: {
            call_summary: "Left a quick rebooking voicemail.",
            custom_analysis_data: {
              customer_name: "Jamie",
              pet_name: "Buddy",
              service_name: "Full Groom",
            },
          },
        },
      }) as never
    );

    expect(response.status).toBe(204);
    expect(upsertCustomerMemoryFromCall).toHaveBeenCalledWith(
      expect.objectContaining({
        customerPhone: "+16195550100",
      })
    );
    expect(sendMissedCallNotification).toHaveBeenCalledWith(
      expect.any(Object),
      "+16195550100",
      "Jamie"
    );
  });
});
