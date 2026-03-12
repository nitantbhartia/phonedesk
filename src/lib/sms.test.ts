import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const createMessage = vi.fn();
const twilioFactory = vi.fn(() => ({
  messages: {
    create: createMessage,
  },
}));

vi.mock("twilio", () => ({
  default: twilioFactory,
}));

describe("sms", () => {
  const originalSid = process.env.TWILIO_ACCOUNT_SID;
  const originalToken = process.env.TWILIO_AUTH_TOKEN;
  const originalFrom = process.env.TWILIO_PHONE_NUMBER;

  beforeEach(() => {
    vi.resetModules();
    createMessage.mockReset();
    twilioFactory.mockClear();
    process.env.TWILIO_ACCOUNT_SID = "AC1234567890";
    process.env.TWILIO_AUTH_TOKEN = "token1234";
    process.env.TWILIO_PHONE_NUMBER = "+16195559999";
  });

  afterEach(() => {
    process.env.TWILIO_ACCOUNT_SID = originalSid;
    process.env.TWILIO_AUTH_TOKEN = originalToken;
    process.env.TWILIO_PHONE_NUMBER = originalFrom;
  });

  it("sends sms through twilio with the fallback from number", async () => {
    const { sendSms } = await import("./sms");
    createMessage.mockResolvedValue({});

    await sendSms("+16195550100", "Hello there");

    expect(createMessage).toHaveBeenCalledWith({
      to: "+16195550100",
      from: "+16195559999",
      body: "Hello there",
    });
  });

  it("throws when no from number is available", async () => {
    const { sendSms } = await import("./sms");
    delete process.env.TWILIO_PHONE_NUMBER;

    await expect(sendSms("+16195550100", "Hello there")).rejects.toThrow(
      "From number is required for Twilio SMS"
    );
  });
});
