import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockValidateEnv,
  mockFindMany,
  mockSyncRetellAgent,
} = vi.hoisted(() => ({
  mockValidateEnv: vi.fn(),
  mockFindMany: vi.fn(),
  mockSyncRetellAgent: vi.fn(),
}));

vi.mock("./lib/env", () => ({
  validateEnv: mockValidateEnv,
}));

vi.mock("./lib/prisma", () => ({
  prisma: {
    business: {
      findMany: mockFindMany,
    },
  },
}));

vi.mock("./lib/retell", () => ({
  syncRetellAgent: mockSyncRetellAgent,
}));

describe("instrumentation register", () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = { ...env, NEXT_RUNTIME: "nodejs" };
    mockValidateEnv.mockReset();
    mockFindMany.mockReset();
    mockSyncRetellAgent.mockReset();
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("registers crash handlers, validates env, and syncs active agents", async () => {
    const onSpy = vi.spyOn(process, "on").mockImplementation(() => process);
    vi.spyOn(console, "error").mockImplementation(() => {});
    mockFindMany.mockResolvedValue([
      { id: "biz_1", retellConfig: { agentId: "agent_1", llmId: "llm_1" } },
      { id: "biz_2", retellConfig: null },
    ]);
    mockSyncRetellAgent.mockResolvedValue(undefined);

    const { register } = await import("./instrumentation");
    await register();
    await Promise.resolve();
    await Promise.resolve();

    expect(onSpy).toHaveBeenCalledWith("uncaughtException", expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith("unhandledRejection", expect.any(Function));
    expect(mockValidateEnv).toHaveBeenCalled();
  });

  it("logs env and sync failures without crashing registration", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "on").mockImplementation(() => process);
    mockValidateEnv.mockImplementation(() => {
      throw new Error("bad env");
    });
    mockFindMany.mockRejectedValue(new Error("db down"));

    const { register } = await import("./instrumentation");
    await register();
    await Promise.resolve();
    await Promise.resolve();

    expect(errorSpy).toHaveBeenCalledWith("[env]", "bad env");
  });

  it("does nothing outside the node runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const onSpy = vi.spyOn(process, "on").mockImplementation(() => process);

    const { register } = await import("./instrumentation");
    await register();

    expect(onSpy).not.toHaveBeenCalled();
  });
});
