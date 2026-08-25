import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  mockValidateEnv,
  mockEnsureTwilioWebhooks,
} = vi.hoisted(() => ({
  mockValidateEnv: vi.fn(),
  mockEnsureTwilioWebhooks: vi.fn(),
}));

vi.mock("./lib/env", () => ({
  validateEnv: mockValidateEnv,
}));

vi.mock("./lib/twilio", () => ({
  ensureTwilioWebhooks: mockEnsureTwilioWebhooks,
}));

describe("instrumentation register", () => {
  const env = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    process.env = { ...env, NEXT_RUNTIME: "nodejs" };
    mockValidateEnv.mockReset();
    mockEnsureTwilioWebhooks.mockReset();
  });

  afterEach(() => {
    process.env = { ...env };
  });

  it("registers crash handlers, validates env, and reconciles Twilio webhooks", async () => {
    const onSpy = vi.spyOn(process, "on").mockImplementation(() => process);
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.TWILIO_ACCOUNT_SID = "AC1234567890";
    process.env.TWILIO_AUTH_TOKEN = "token1234";
    process.env.TWILIO_PHONE_NUMBER = "+16195559999";
    mockEnsureTwilioWebhooks.mockResolvedValue(undefined);

    const { register } = await import("./instrumentation");
    await register();
    await Promise.resolve();
    await Promise.resolve();
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(onSpy).toHaveBeenCalledWith("uncaughtException", expect.any(Function));
    expect(onSpy).toHaveBeenCalledWith("unhandledRejection", expect.any(Function));
    expect(mockValidateEnv).toHaveBeenCalled();
    expect(mockEnsureTwilioWebhooks).toHaveBeenCalledWith("+16195559999");
  });

  it("logs env and sync failures without crashing registration", async () => {
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(process, "on").mockImplementation(() => process);
    mockValidateEnv.mockImplementation(() => {
      throw new Error("bad env");
    });

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
