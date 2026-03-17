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
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
      updateMany: vi.fn(),
    },
    demoNumber: {
      findUnique: vi.fn(),
    },
  },
}));

vi.mock("@/lib/customer-memory", () => ({
  lookupCustomerContext: vi.fn(),
  upsertCustomerMemoryFromCall: vi.fn(),
}));

vi.mock("@/lib/retell", () => ({
  refreshRetellLLMForCall: vi.fn(),
  endRetellCall: vi.fn().mockResolvedValue(undefined),
  updateRetellPhoneNumber: vi.fn().mockResolvedValue(undefined),
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
    process.env.DEMO_BUSINESS_ID = "demo_biz";
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
    // No previous attempts with this phone, no previous calls
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.call.findFirst).mockResolvedValue(null);
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

  it("still sets callerPhone when a previous short/blocked demo call exists for the same phone", async () => {
    process.env.DEMO_BUSINESS_ID = "demo_biz";
    vi.mocked(resolveDemoSession).mockResolvedValue({
      businessId: "demo_biz",
      source: "public",
      demoNumberId: "demo_num_1",
      publicAttemptId: "attempt_2",
      leadId: null,
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
    // A previous attempt exists with same callerPhone (from the broken call)
    vi.mocked(prisma.publicDemoAttempt.findFirst).mockResolvedValue({
      id: "attempt_1",
      callerPhone: "+16195550100",
      startedAt: new Date(),
    } as never);
    // But the previous call was short (blocked by subscription gate: ~5 seconds)
    vi.mocked(prisma.call.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.publicDemoAttempt.update).mockResolvedValue({ id: "attempt_2" } as never);

    const response = await POST(
      makeRequest({
        event: "call_started",
        call: {
          call_id: "call_demo_retry",
          from_number: "(619) 555-0100",
          to_number: "+1 (716) 576-3523",
        },
      }) as never
    );

    expect(response.status).toBe(204);
    // callerPhone should be set on the NEW attempt so the page can detect the call
    expect(prisma.publicDemoAttempt.update).toHaveBeenCalledWith({
      where: { id: "attempt_2" },
      data: { callerPhone: "+16195550100" },
    });
    // Call record should still be created
    expect(prisma.call.upsert).toHaveBeenCalled();
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

  // ── Issue A: handleCallEnded returns 500 on DB failure ──────────────
  it("returns 500 when handleCallEnded DB write fails so Retell retries", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
      business: { id: "biz_1", phoneNumber: { number: "+16195559999" } },
    } as never);
    vi.mocked(prisma.call.findUnique).mockResolvedValue(null);
    vi.mocked(prisma.call.create).mockRejectedValue(new Error("DB connection lost"));

    const response = await POST(
      makeRequest({
        event: "call_ended",
        call: {
          call_id: "call_db_fail",
          from_number: "+16195550100",
          to_number: "+16195559999",
          start_timestamp: 1000,
          end_timestamp: 91000,
        },
      }) as never
    );

    expect(response.status).toBe(500);
  });

  // ── Issue C: upsertCustomerMemoryFromCall failure is non-fatal ─────
  it("does not crash call_analyzed when upsertCustomerMemoryFromCall throws", async () => {
    vi.mocked(upsertCustomerMemoryFromCall).mockRejectedValue(
      new Error("memory upsert failed")
    );
    vi.mocked(prisma.call.findUnique)
      .mockResolvedValueOnce({
        id: "db_call_mem",
        businessId: "biz_1",
        retellCallId: "call_mem_fail",
        callerName: null,
        callerPhone: "+16195550100",
        appointmentId: "appt_1",
        status: "COMPLETED",
        isTestCall: false,
      } as never)
      .mockResolvedValueOnce({
        id: "db_call_mem",
        businessId: "biz_1",
        retellCallId: "call_mem_fail",
        callerName: "Jamie",
        callerPhone: "+16195550100",
        appointmentId: "appt_1",
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
          call_id: "call_mem_fail",
          from_number: "+16195550100",
          call_analysis: {
            call_summary: "Booked a groom.",
            custom_analysis_data: { customer_name: "Jamie" },
          },
        },
      }) as never
    );

    // Should succeed despite memory upsert failure
    expect(response.status).toBe(204);
    expect(upsertCustomerMemoryFromCall).toHaveBeenCalled();
    // Call update should still have happened
    expect(prisma.call.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { retellCallId: "call_mem_fail" },
      })
    );
  });

  // ── Demo rate limit: blocks repeat calls when endRetellCall succeeds ─
  it("ends the call and returns early when a repeat demo call is successfully ended", async () => {
    const { endRetellCall } = await import("@/lib/retell");
    vi.mocked(endRetellCall).mockResolvedValue(undefined);
    process.env.DEMO_BUSINESS_ID = "demo_biz";
    vi.mocked(resolveDemoSession).mockResolvedValue({
      businessId: "demo_biz",
      source: "public",
      demoNumberId: "demo_num_1",
      publicAttemptId: "attempt_1",
      leadId: null,
      callerPhone: "+16195550100",
    });
    vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);
    vi.mocked(prisma.business.findUnique)
      .mockResolvedValueOnce({
        id: "demo_biz",
        retellConfig: { llmId: "llm_demo" },
      } as never)
      .mockResolvedValueOnce({
        onboardingComplete: true,
      } as never);
    vi.mocked(prisma.call.findFirst).mockResolvedValue({
      id: "prev_call",
      duration: 120,
      callerPhone: "+16195550100",
    } as never);

    const response = await POST(
      makeRequest({
        event: "call_started",
        call: {
          call_id: "call_repeat",
          from_number: "(619) 555-0100",
          to_number: "+1 (716) 576-3523",
        },
      }) as never
    );

    expect(response.status).toBe(204);
    expect(endRetellCall).toHaveBeenCalledWith("call_repeat");
    expect(prisma.call.upsert).not.toHaveBeenCalled();
  });

  // ── Demo rate limit: proceeds normally when endRetellCall fails ─────
  it("proceeds with normal call flow when endRetellCall fails for a repeat demo call", async () => {
    const { endRetellCall } = await import("@/lib/retell");
    vi.mocked(endRetellCall).mockRejectedValue(new Error("Cannot delete an ongoing call"));
    process.env.DEMO_BUSINESS_ID = "demo_biz";
    vi.mocked(resolveDemoSession).mockResolvedValue({
      businessId: "demo_biz",
      source: "public",
      demoNumberId: "demo_num_1",
      publicAttemptId: "attempt_1",
      leadId: null,
      callerPhone: "+16195550100",
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
    vi.mocked(prisma.call.findFirst).mockResolvedValue({
      id: "prev_call",
      duration: 120,
      callerPhone: "+16195550100",
    } as never);

    const response = await POST(
      makeRequest({
        event: "call_started",
        call: {
          call_id: "call_repeat_fail",
          from_number: "(619) 555-0100",
          to_number: "+1 (716) 576-3523",
        },
      }) as never
    );

    expect(response.status).toBe(204);
    // Should still create the call record with isTestCall so call_analyzed
    // doesn't send missed-call notifications
    expect(prisma.call.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        create: expect.objectContaining({ isTestCall: true }),
      })
    );
  });

  // ═══════════════════════════════════════════════════════════════════
  // CRITICAL: Public demo call lifecycle regression tests
  //
  // These tests cover the full lifecycle of a public demo call:
  //   call_started → call_ended → call_analyzed
  // and all the invariants that must hold at each stage.
  // ═══════════════════════════════════════════════════════════════════

  describe("public demo call lifecycle (critical path)", () => {
    const demoBizSetup = () => {
      process.env.DEMO_BUSINESS_ID = "demo_biz";
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
    };

    const makeDemoCallStarted = (callId: string) =>
      makeRequest({
        event: "call_started",
        call: {
          call_id: callId,
          from_number: "(619) 555-0100",
          to_number: "+1 (716) 576-3523",
        },
      });

    // ── Invariant: callerPhone is ALWAYS set on the attempt ──────────
    it("sets callerPhone on the publicDemoAttempt on very first call (new lead)", async () => {
      demoBizSetup();
      vi.mocked(resolveDemoSession).mockResolvedValue({
        businessId: "demo_biz",
        source: "public",
        demoNumberId: "demo_num_1",
        publicAttemptId: "attempt_1",
        leadId: "lead_1",
        callerPhone: null,
      });
      vi.mocked(prisma.call.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.publicDemoAttempt.update).mockResolvedValue({} as never);
      vi.mocked(prisma.demoLead.update).mockResolvedValue({} as never);

      await POST(makeDemoCallStarted("call_first") as never);

      // callerPhone must always be set so the browser can detect the call
      expect(prisma.publicDemoAttempt.update).toHaveBeenCalledWith({
        where: { id: "attempt_1" },
        data: { callerPhone: "+16195550100" },
      });
    });

    it("sets callerPhone on a NEW attempt even when a prior attempt already has the phone", async () => {
      demoBizSetup();
      vi.mocked(resolveDemoSession).mockResolvedValue({
        businessId: "demo_biz",
        source: "public",
        demoNumberId: "demo_num_1",
        publicAttemptId: "attempt_new",
        leadId: null,
        callerPhone: null,   // NEW attempt → callerPhone not yet recorded
      });
      vi.mocked(prisma.call.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.publicDemoAttempt.update).mockResolvedValue({} as never);

      await POST(makeDemoCallStarted("call_second_attempt") as never);

      expect(prisma.publicDemoAttempt.update).toHaveBeenCalledWith({
        where: { id: "attempt_new" },
        data: { callerPhone: "+16195550100" },
      });
    });

    // ── Invariant: call record always created with isTestCall=true ───
    it("creates call record with isTestCall=true on first demo call", async () => {
      demoBizSetup();
      vi.mocked(resolveDemoSession).mockResolvedValue({
        businessId: "demo_biz",
        source: "public",
        demoNumberId: "demo_num_1",
        publicAttemptId: "attempt_1",
        leadId: null,
        callerPhone: null,
      });
      vi.mocked(prisma.call.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.publicDemoAttempt.update).mockResolvedValue({} as never);

      await POST(makeDemoCallStarted("call_first") as never);

      expect(prisma.call.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            businessId: "demo_biz",
            retellCallId: "call_first",
            callerPhone: "+16195550100",
            isTestCall: true,
            status: "IN_PROGRESS",
          }),
          update: expect.objectContaining({
            isTestCall: true,
          }),
        })
      );
    });

    it("creates call record with isTestCall=true even when rate-limited and endRetellCall fails", async () => {
      const { endRetellCall } = await import("@/lib/retell");
      vi.mocked(endRetellCall).mockRejectedValue(new Error("Cannot delete ongoing call"));
      demoBizSetup();
      vi.mocked(resolveDemoSession).mockResolvedValue({
        businessId: "demo_biz",
        source: "public",
        demoNumberId: "demo_num_1",
        publicAttemptId: "attempt_1",
        leadId: null,
        callerPhone: "+16195550100",
      });
      vi.mocked(prisma.call.findFirst).mockResolvedValue({
        id: "prev_call",
        duration: 120,
      } as never);

      await POST(makeDemoCallStarted("call_rate_limited") as never);

      // CRITICAL: call record must still be created with isTestCall
      expect(prisma.call.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            retellCallId: "call_rate_limited",
            isTestCall: true,
          }),
        })
      );
    });

    // ── Invariant: NO call record when rate limit succeeds ───────────
    it("does NOT create a call record when endRetellCall succeeds (call actually ended)", async () => {
      const { endRetellCall } = await import("@/lib/retell");
      vi.mocked(endRetellCall).mockResolvedValue(undefined);
      demoBizSetup();
      vi.mocked(resolveDemoSession).mockResolvedValue({
        businessId: "demo_biz",
        source: "public",
        demoNumberId: "demo_num_1",
        publicAttemptId: "attempt_1",
        leadId: null,
        callerPhone: "+16195550100",
      });
      vi.mocked(prisma.call.findFirst).mockResolvedValue({
        id: "prev_call",
        duration: 120,
      } as never);

      await POST(makeDemoCallStarted("call_ended_by_limiter") as never);

      expect(endRetellCall).toHaveBeenCalledWith("call_ended_by_limiter");
      expect(prisma.call.upsert).not.toHaveBeenCalled();
    });

    // ── Invariant: short calls (<30s) don't trigger rate limit ───────
    it("does NOT rate-limit when previous demo call was short (<30s)", async () => {
      demoBizSetup();
      vi.mocked(resolveDemoSession).mockResolvedValue({
        businessId: "demo_biz",
        source: "public",
        demoNumberId: "demo_num_1",
        publicAttemptId: "attempt_2",
        leadId: null,
        callerPhone: null,
      });
      // Previous call was only 10s (e.g. blocked by subscription gate)
      vi.mocked(prisma.call.findFirst).mockResolvedValue(null);
      vi.mocked(prisma.publicDemoAttempt.update).mockResolvedValue({} as never);

      await POST(makeDemoCallStarted("call_after_short") as never);

      // Should proceed normally — create a call record
      expect(prisma.call.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            retellCallId: "call_after_short",
            isTestCall: true,
          }),
        })
      );
    });

    // ── Invariant: demo call_analyzed NEVER sends missed-call SMS ────
    it("never sends missed-call notification for demo calls even without appointmentId", async () => {
      vi.mocked(prisma.call.findUnique)
        .mockResolvedValueOnce({
          id: "db_demo_call",
          businessId: "demo_biz",
          retellCallId: "call_demo_analyzed",
          callerName: null,
          callerPhone: "+16195550100",
          appointmentId: null,    // no booking made
          status: "COMPLETED",
          isTestCall: true,       // CRITICAL: this flag must be set
        } as never)
        .mockResolvedValueOnce({
          id: "db_demo_call",
          businessId: "demo_biz",
          retellCallId: "call_demo_analyzed",
          callerName: "Jamie",
          callerPhone: "+16195550100",
          appointmentId: null,
          status: "COMPLETED",
          isTestCall: true,
          business: {
            id: "demo_biz",
            name: "Woof Roof",
            phone: "+16195550000",
            phoneNumber: { number: "+17165763523" },
          },
        } as never);

      await POST(
        makeRequest({
          event: "call_analyzed",
          call: {
            call_id: "call_demo_analyzed",
            from_number: "+16195550100",
            call_analysis: {
              call_summary: "Asked about grooming prices.",
              custom_analysis_data: { customer_name: "Jamie" },
            },
          },
        }) as never
      );

      // These are the exact SMS that were incorrectly sent before the fix
      expect(sendMissedCallNotification).not.toHaveBeenCalled();
      expect(upsertCustomerMemoryFromCall).not.toHaveBeenCalled();
      // Status should NOT be updated to NO_BOOKING for test calls
      const updateCalls = vi.mocked(prisma.call.update).mock.calls;
      const noBookingUpdate = updateCalls.find(
        ([args]) => (args as { data?: { status?: string } }).data?.status === "NO_BOOKING"
      );
      expect(noBookingUpdate).toBeUndefined();
    });

    // ── Invariant: demo call_analyzed with booking NEVER sends SMS ───
    it("never sends missed-call notification for demo calls that DID book", async () => {
      vi.mocked(prisma.call.findUnique)
        .mockResolvedValueOnce({
          id: "db_demo_booked",
          businessId: "demo_biz",
          retellCallId: "call_demo_booked",
          callerName: null,
          callerPhone: "+16195550100",
          appointmentId: "appt_demo_1",  // booking exists
          status: "COMPLETED",
          isTestCall: true,
        } as never)
        .mockResolvedValueOnce({
          id: "db_demo_booked",
          businessId: "demo_biz",
          retellCallId: "call_demo_booked",
          callerName: "Jamie",
          callerPhone: "+16195550100",
          appointmentId: "appt_demo_1",
          status: "COMPLETED",
          isTestCall: true,
          business: {
            id: "demo_biz",
            name: "Woof Roof",
            phone: "+16195550000",
            phoneNumber: { number: "+17165763523" },
          },
        } as never);

      await POST(
        makeRequest({
          event: "call_analyzed",
          call: {
            call_id: "call_demo_booked",
            from_number: "+16195550100",
            call_analysis: {
              call_summary: "Booked a nail trim for Luna.",
              custom_analysis_data: {
                customer_name: "Jamie",
                pet_name: "Luna",
                service_name: "Nail Trim",
              },
            },
          },
        }) as never
      );

      expect(sendMissedCallNotification).not.toHaveBeenCalled();
      expect(upsertCustomerMemoryFromCall).not.toHaveBeenCalled();
    });

    // ── Invariant: callerPhone set BEFORE rate limit check ───────────
    it("sets callerPhone on attempt before rate-limit check so browser always detects the call", async () => {
      const { endRetellCall } = await import("@/lib/retell");
      vi.mocked(endRetellCall).mockRejectedValue(new Error("fail"));
      demoBizSetup();
      vi.mocked(resolveDemoSession).mockResolvedValue({
        businessId: "demo_biz",
        source: "public",
        demoNumberId: "demo_num_1",
        publicAttemptId: "attempt_browser",
        leadId: "lead_browser",
        callerPhone: null,   // browser needs this to be set
      });
      vi.mocked(prisma.call.findFirst).mockResolvedValue({
        id: "prev",
        duration: 200,
      } as never);
      vi.mocked(prisma.publicDemoAttempt.update).mockResolvedValue({} as never);
      vi.mocked(prisma.demoLead.update).mockResolvedValue({} as never);

      await POST(makeDemoCallStarted("call_browser_detect") as never);

      // callerPhone MUST be set regardless of rate-limit outcome
      expect(prisma.publicDemoAttempt.update).toHaveBeenCalledWith({
        where: { id: "attempt_browser" },
        data: { callerPhone: "+16195550100" },
      });
      // cooldown should also be set
      expect(prisma.demoLead.update).toHaveBeenCalledWith({
        where: { id: "lead_browser" },
        data: { cooldownUntil: expect.any(Date) },
      });
    });

    // ── Invariant: private demo sessions skip rate limit entirely ────
    it("does not rate-limit private (onboarding) demo calls", async () => {
      process.env.DEMO_BUSINESS_ID = "demo_biz";
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);
      vi.mocked(resolveDemoSession).mockResolvedValue({
        businessId: "biz_owner",
        source: "private",       // onboarding demo — not public
        demoNumberId: "demo_num_1",
        publicAttemptId: null,
        leadId: null,
        callerPhone: null,
      } as never);
      vi.mocked(prisma.business.findUnique)
        .mockResolvedValueOnce({
          id: "biz_owner",
          timezone: "America/Los_Angeles",
          retellConfig: { llmId: "llm_owner" },
        } as never)
        .mockResolvedValueOnce({
          onboardingComplete: false,
        } as never);

      await POST(makeDemoCallStarted("call_private_demo") as never);

      // Should NOT check for previous calls
      expect(prisma.call.findFirst).not.toHaveBeenCalled();
      // Should create a call record normally
      expect(prisma.call.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            retellCallId: "call_private_demo",
            isTestCall: true,
          }),
        })
      );
    });

    // ── Invariant: LLM refresh still happens for rate-limited fallback ─
    it("refreshes the LLM even when rate limiter fires but fails to end the call", async () => {
      const { endRetellCall } = await import("@/lib/retell");
      vi.mocked(endRetellCall).mockRejectedValue(new Error("fail"));
      demoBizSetup();
      vi.mocked(resolveDemoSession).mockResolvedValue({
        businessId: "demo_biz",
        source: "public",
        demoNumberId: "demo_num_1",
        publicAttemptId: "attempt_1",
        leadId: null,
        callerPhone: "+16195550100",
      });
      vi.mocked(prisma.call.findFirst).mockResolvedValue({
        id: "prev",
        duration: 200,
      } as never);

      await POST(makeDemoCallStarted("call_llm_refresh") as never);

      expect(refreshRetellLLMForCall).toHaveBeenCalledWith(
        "llm_demo",
        "America/Los_Angeles"
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // OUTBOUND CALL LIFECYCLE
  // ═══════════════════════════════════════════════════════════════════

  describe("outbound call lifecycle (critical path)", () => {
    it("upserts an IN_PROGRESS call with isOutbound=true on outbound call_started", async () => {
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
        businessId: "biz_1",
      } as never);

      const response = await POST(
        makeRequest({
          event: "call_started",
          call: {
            call_id: "call_outbound_1",
            direction: "outbound",
            from_number: "+16195559999",  // our number
            to_number: "+16195550100",     // customer
          },
        }) as never
      );

      expect(response.status).toBe(204);
      expect(prisma.call.upsert).toHaveBeenCalledWith({
        where: { retellCallId: "call_outbound_1" },
        create: {
          businessId: "biz_1",
          retellCallId: "call_outbound_1",
          callerPhone: "+16195550100",
          status: "IN_PROGRESS",
          isOutbound: true,
        },
        update: { status: "IN_PROGRESS" },
      });
      // Outbound call_started should NOT look up customer context or refresh LLM
      expect(lookupCustomerContext).not.toHaveBeenCalled();
      expect(refreshRetellLLMForCall).not.toHaveBeenCalled();
    });

    it("does not upsert an outbound call if our number has no phoneNumber record", async () => {
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);

      const response = await POST(
        makeRequest({
          event: "call_started",
          call: {
            call_id: "call_outbound_orphan",
            direction: "outbound",
            from_number: "+16195559999",
            to_number: "+16195550100",
          },
        }) as never
      );

      expect(response.status).toBe(204);
      expect(prisma.call.upsert).not.toHaveBeenCalled();
    });

    it("updates outbound call via updateMany on call_ended (not create)", async () => {
      const response = await POST(
        makeRequest({
          event: "call_ended",
          call: {
            call_id: "call_outbound_ended",
            direction: "outbound",
            from_number: "+16195559999",
            to_number: "+16195550100",
            duration_ms: 45000,
            transcript: "Left a voicemail for rebooking.",
            recording_url: "https://example.com/outbound.mp3",
          },
        }) as never
      );

      expect(response.status).toBe(204);
      expect(prisma.call.updateMany).toHaveBeenCalledWith({
        where: { retellCallId: "call_outbound_ended" },
        data: {
          duration: 45,
          transcript: "Left a voicemail for rebooking.",
          transcriptObject: undefined,
          status: "COMPLETED",
          recordingUrl: "https://example.com/outbound.mp3",
        },
      });
      // Should NOT attempt to look up business or create a new call record
      expect(prisma.phoneNumber.findFirst).not.toHaveBeenCalled();
      expect(prisma.call.create).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // SESSIONLESS DEMO NUMBER REJECTION
  // ═══════════════════════════════════════════════════════════════════

  describe("sessionless demo number rejection", () => {
    it("ends the call and clears inboundAgentId when a demo number has no active session", async () => {
      const { endRetellCall, updateRetellPhoneNumber } = await import("@/lib/retell");
      vi.mocked(endRetellCall).mockResolvedValue(undefined);
      vi.mocked(updateRetellPhoneNumber).mockResolvedValue(undefined);
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);
      vi.mocked(resolveDemoSession).mockResolvedValue(null);
      vi.mocked(prisma.demoNumber.findUnique).mockResolvedValue({
        id: "demo_num_1",
        retellPhoneNumber: "retell_phone_1",
      } as never);

      const response = await POST(
        makeRequest({
          event: "call_started",
          call: {
            call_id: "call_no_session",
            from_number: "+16195550100",
            to_number: "+17165763523",
          },
        }) as never
      );

      expect(response.status).toBe(204);
      expect(endRetellCall).toHaveBeenCalledWith("call_no_session");
      expect(updateRetellPhoneNumber).toHaveBeenCalledWith("retell_phone_1", { inboundAgentId: null });
      expect(prisma.call.upsert).not.toHaveBeenCalled();
    });

    it("still returns 204 when the demo number has no retellPhoneNumber to clear", async () => {
      const { endRetellCall, updateRetellPhoneNumber } = await import("@/lib/retell");
      vi.mocked(endRetellCall).mockResolvedValue(undefined);
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);
      vi.mocked(resolveDemoSession).mockResolvedValue(null);
      vi.mocked(prisma.demoNumber.findUnique).mockResolvedValue({
        id: "demo_num_1",
        retellPhoneNumber: null,
      } as never);

      const response = await POST(
        makeRequest({
          event: "call_started",
          call: {
            call_id: "call_no_retell_phone",
            from_number: "+16195550100",
            to_number: "+17165763523",
          },
        }) as never
      );

      expect(response.status).toBe(204);
      expect(endRetellCall).toHaveBeenCalledWith("call_no_retell_phone");
      expect(updateRetellPhoneNumber).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // INPUT VALIDATION & EDGE CASES
  // ═══════════════════════════════════════════════════════════════════

  describe("input validation and edge cases", () => {
    it("returns 400 for invalid JSON body", async () => {
      const req = new Request("http://localhost/api/retell/webhook", {
        method: "POST",
        headers: { "content-type": "application/json", "x-retell-signature": "sig" },
        body: "not valid json {{{",
      });

      const response = await POST(req as never);

      expect(response.status).toBe(400);
      await expect(response.json()).resolves.toEqual({ error: "Invalid JSON" });
    });

    it("returns 200 ok when event or call is missing from the payload", async () => {
      const response = await POST(makeRequest({ event: "call_started" }) as never);

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
    });

    it("returns 200 ok for unknown event types", async () => {
      const response = await POST(
        makeRequest({
          event: "call_transferred",
          call: { call_id: "call_unknown" },
        }) as never
      );

      expect(response.status).toBe(200);
      await expect(response.json()).resolves.toEqual({ ok: true });
    });

    it("handles call_started gracefully when call_id is missing", async () => {
      const response = await POST(
        makeRequest({
          event: "call_started",
          call: {
            from_number: "+16195550100",
            to_number: "+16195559999",
          },
        }) as never
      );

      expect(response.status).toBe(204);
      expect(prisma.call.upsert).not.toHaveBeenCalled();
    });

    it("handles call_analyzed gracefully when call_id is missing", async () => {
      const response = await POST(
        makeRequest({
          event: "call_analyzed",
          call: {
            from_number: "+16195550100",
            call_analysis: { call_summary: "Some summary" },
          },
        }) as never
      );

      expect(response.status).toBe(204);
      expect(prisma.call.findUnique).not.toHaveBeenCalled();
    });

    it("handles call_analyzed gracefully when no existing call record is found", async () => {
      vi.mocked(prisma.call.findUnique).mockResolvedValue(null);

      const response = await POST(
        makeRequest({
          event: "call_analyzed",
          call: {
            call_id: "call_orphan",
            from_number: "+16195550100",
            call_analysis: { call_summary: "No record exists." },
          },
        }) as never
      );

      expect(response.status).toBe(204);
      expect(prisma.call.update).not.toHaveBeenCalled();
      expect(upsertCustomerMemoryFromCall).not.toHaveBeenCalled();
      expect(sendMissedCallNotification).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CALL_ENDED REGRESSION: existing record vs new record
  // ═══════════════════════════════════════════════════════════════════

  describe("call_ended record handling", () => {
    it("updates an existing call record instead of creating a new one", async () => {
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
        business: { id: "biz_1", phoneNumber: { number: "+16195559999" } },
      } as never);
      vi.mocked(prisma.call.findUnique).mockResolvedValue({
        id: "existing_call",
        retellCallId: "call_existing",
      } as never);

      const response = await POST(
        makeRequest({
          event: "call_ended",
          call: {
            call_id: "call_existing",
            from_number: "+16195550100",
            to_number: "+16195559999",
            duration_ms: 120000,
            transcript: "Booked a groom for Buddy.",
            recording_url: "https://example.com/rec.mp3",
          },
        }) as never
      );

      expect(response.status).toBe(204);
      expect(prisma.call.update).toHaveBeenCalledWith({
        where: { retellCallId: "call_existing" },
        data: {
          callerPhone: "+16195550100",
          duration: 120,
          transcript: "Booked a groom for Buddy.",
          transcriptObject: undefined,
          status: "COMPLETED",
          recordingUrl: "https://example.com/rec.mp3",
        },
      });
      expect(prisma.call.create).not.toHaveBeenCalled();
    });

    it("prefers duration_ms over timestamp calculation", async () => {
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
        business: { id: "biz_1", phoneNumber: { number: "+16195559999" } },
      } as never);
      vi.mocked(prisma.call.findUnique).mockResolvedValue(null);

      await POST(
        makeRequest({
          event: "call_ended",
          call: {
            call_id: "call_duration",
            from_number: "+16195550100",
            to_number: "+16195559999",
            duration_ms: 75000,
            start_timestamp: 1000,
            end_timestamp: 200000, // would be 199s — should be ignored
          },
        }) as never
      );

      expect(prisma.call.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            duration: 75, // from duration_ms, not timestamps
          }),
        })
      );
    });

    it("falls back to timestamp calculation when duration_ms is absent", async () => {
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
        business: { id: "biz_1", phoneNumber: { number: "+16195559999" } },
      } as never);
      vi.mocked(prisma.call.findUnique).mockResolvedValue(null);

      await POST(
        makeRequest({
          event: "call_ended",
          call: {
            call_id: "call_ts_fallback",
            from_number: "+16195550100",
            to_number: "+16195559999",
            start_timestamp: 10000,
            end_timestamp: 130000,
          },
        }) as never
      );

      expect(prisma.call.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            duration: 120, // (130000 - 10000) / 1000
          }),
        })
      );
    });

    it("sets duration to null when neither duration_ms nor timestamps are present", async () => {
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
        business: { id: "biz_1", phoneNumber: { number: "+16195559999" } },
      } as never);
      vi.mocked(prisma.call.findUnique).mockResolvedValue(null);

      await POST(
        makeRequest({
          event: "call_ended",
          call: {
            call_id: "call_no_duration",
            from_number: "+16195550100",
            to_number: "+16195559999",
          },
        }) as never
      );

      expect(prisma.call.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            duration: null,
          }),
        })
      );
    });

    it("resolves business via demo session fallback when phoneNumber is missing", async () => {
      const { resolveBusinessFromDemo } = await import("@/lib/demo-session");
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);
      vi.mocked(resolveBusinessFromDemo).mockResolvedValue("demo_biz");
      vi.mocked(prisma.business.findUnique).mockResolvedValue({
        id: "demo_biz",
        phoneNumber: null,
      } as never);
      vi.mocked(prisma.call.findUnique).mockResolvedValue(null);

      const response = await POST(
        makeRequest({
          event: "call_ended",
          call: {
            call_id: "call_demo_ended",
            from_number: "+16195550100",
            to_number: "+17165763523",
            duration_ms: 60000,
          },
        }) as never
      );

      expect(response.status).toBe(204);
      expect(prisma.call.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            businessId: "demo_biz",
          }),
        })
      );
    });

    it("returns 204 silently when no business can be resolved for call_ended", async () => {
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue(null);

      const response = await POST(
        makeRequest({
          event: "call_ended",
          call: {
            call_id: "call_no_biz",
            from_number: "+16195550100",
            to_number: "+10000000000",
          },
        }) as never
      );

      expect(response.status).toBe(204);
      expect(prisma.call.create).not.toHaveBeenCalled();
      expect(prisma.call.update).not.toHaveBeenCalled();
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // CALL_ANALYZED: name extraction priority regression
  // ═══════════════════════════════════════════════════════════════════

  describe("call_analyzed name extraction", () => {
    it("prefers AI-extracted customerName over pre-filled callerName", async () => {
      vi.mocked(prisma.call.findUnique)
        .mockResolvedValueOnce({
          id: "db_call_name",
          businessId: "biz_1",
          retellCallId: "call_name_pref",
          callerName: "Old Pre-filled Name",
          callerPhone: "+16195550100",
          appointmentId: "appt_1",
          status: "COMPLETED",
          isTestCall: false,
        } as never)
        .mockResolvedValueOnce({
          id: "db_call_name",
          businessId: "biz_1",
          retellCallId: "call_name_pref",
          callerName: "AI-Extracted Name",
          callerPhone: "+16195550100",
          appointmentId: "appt_1",
          status: "COMPLETED",
          isTestCall: false,
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
            call_id: "call_name_pref",
            from_number: "+16195550100",
            call_analysis: {
              call_summary: "Booked groom.",
              custom_analysis_data: {
                customerName: "AI-Extracted Name",
              },
            },
          },
        }) as never
      );

      expect(prisma.call.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            callerName: "AI-Extracted Name",
          }),
        })
      );
    });

    it("falls back to pre-filled callerName when AI extraction returns nothing", async () => {
      vi.mocked(prisma.call.findUnique)
        .mockResolvedValueOnce({
          id: "db_call_fallback",
          businessId: "biz_1",
          retellCallId: "call_name_fallback",
          callerName: "Pre-filled Sarah",
          callerPhone: "+16195550100",
          appointmentId: null,
          status: "COMPLETED",
          isTestCall: false,
        } as never)
        .mockResolvedValueOnce({
          id: "db_call_fallback",
          businessId: "biz_1",
          retellCallId: "call_name_fallback",
          callerName: "Pre-filled Sarah",
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

      await POST(
        makeRequest({
          event: "call_analyzed",
          call: {
            call_id: "call_name_fallback",
            from_number: "+16195550100",
            call_analysis: {
              call_summary: "Asked for pricing.",
              custom_analysis_data: {},
            },
          },
        }) as never
      );

      expect(prisma.call.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            callerName: "Pre-filled Sarah",
          }),
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // ONBOARDING TEST CALL HANDLING
  // ═══════════════════════════════════════════════════════════════════

  describe("onboarding test call handling", () => {
    it("marks call as isTestCall=true when onboarding is incomplete", async () => {
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
        businessId: "biz_onboarding",
        business: {
          timezone: "America/New_York",
          retellConfig: null,
        },
      } as never);
      vi.mocked(prisma.business.findUnique).mockResolvedValue({
        onboardingComplete: false,
      } as never);
      vi.mocked(lookupCustomerContext).mockResolvedValue({
        customer: null,
      } as never);

      await POST(
        makeRequest({
          event: "call_started",
          call: {
            call_id: "call_onboarding",
            from_number: "+16195550100",
            to_number: "+16195559999",
          },
        }) as never
      );

      expect(prisma.call.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            isTestCall: true,
          }),
        })
      );
    });

    it("marks call as isTestCall=false when onboarding is complete", async () => {
      vi.mocked(prisma.phoneNumber.findFirst).mockResolvedValue({
        businessId: "biz_live",
        business: {
          timezone: "America/New_York",
          retellConfig: null,
        },
      } as never);
      vi.mocked(prisma.business.findUnique).mockResolvedValue({
        onboardingComplete: true,
      } as never);
      vi.mocked(lookupCustomerContext).mockResolvedValue({
        customer: null,
      } as never);

      await POST(
        makeRequest({
          event: "call_started",
          call: {
            call_id: "call_live",
            from_number: "+16195550100",
            to_number: "+16195559999",
          },
        }) as never
      );

      expect(prisma.call.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            isTestCall: false,
          }),
        })
      );
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // UNHANDLED ERROR RECOVERY
  // ═══════════════════════════════════════════════════════════════════

  it("returns 204 (not 500) for unhandled errors in call_started to prevent retries", async () => {
    vi.mocked(prisma.phoneNumber.findFirst).mockRejectedValue(
      new Error("unexpected DB crash")
    );

    const response = await POST(
      makeRequest({
        event: "call_started",
        call: {
          call_id: "call_crash",
          from_number: "+16195550100",
          to_number: "+16195559999",
        },
      }) as never
    );

    expect(response.status).toBe(204);
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
