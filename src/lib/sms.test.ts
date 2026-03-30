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
  const originalSmsEnabled = process.env.SMS_ENABLED;
  const originalSmsProvider = process.env.SMS_PROVIDER;
  const originalTextbeltKey = process.env.TEXTBELT_API_KEY;
  const originalTextbeltSender = process.env.TEXTBELT_SENDER;
  const originalAppUrl = process.env.NEXT_PUBLIC_APP_URL;
  const originalFetch = global.fetch;

  beforeEach(() => {
    vi.resetModules();
    createMessage.mockReset();
    twilioFactory.mockClear();
    process.env.TWILIO_ACCOUNT_SID = "AC1234567890";
    process.env.TWILIO_AUTH_TOKEN = "token1234";
    process.env.TWILIO_PHONE_NUMBER = "+16195559999";
    delete process.env.SMS_ENABLED;
    delete process.env.SMS_PROVIDER;
    delete process.env.TEXTBELT_API_KEY;
    process.env.TEXTBELT_SENDER = "RingPaw";
    process.env.NEXT_PUBLIC_APP_URL = "https://ringpaw.com";
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env.TWILIO_ACCOUNT_SID = originalSid;
    process.env.TWILIO_AUTH_TOKEN = originalToken;
    process.env.TWILIO_PHONE_NUMBER = originalFrom;
    process.env.SMS_ENABLED = originalSmsEnabled;
    process.env.SMS_PROVIDER = originalSmsProvider;
    process.env.TEXTBELT_API_KEY = originalTextbeltKey;
    process.env.TEXTBELT_SENDER = originalTextbeltSender;
    process.env.NEXT_PUBLIC_APP_URL = originalAppUrl;
    global.fetch = originalFetch;
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

  it("skips sending when sms is not fully configured", async () => {
    const { sendSms } = await import("./sms");
    delete process.env.TWILIO_PHONE_NUMBER;

    await expect(sendSms("+16195550100", "Hello there")).resolves.toBeUndefined();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("skips sending when sms is explicitly disabled", async () => {
    const { sendSms } = await import("./sms");
    process.env.SMS_ENABLED = "false";

    await expect(sendSms("+16195550100", "Hello there")).resolves.toBeUndefined();
    expect(createMessage).not.toHaveBeenCalled();
  });

  it("sends sms through textbelt when configured as the provider", async () => {
    const { sendSms, getSmsProvider, shouldAttachRetellSmsWebhook } = await import("./sms");
    process.env.SMS_PROVIDER = "textbelt";
    process.env.TEXTBELT_API_KEY = "textbelt-key";
    delete process.env.TWILIO_ACCOUNT_SID;
    delete process.env.TWILIO_AUTH_TOKEN;
    delete process.env.TWILIO_PHONE_NUMBER;
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ success: true, textId: "txt_1" }),
    } as never);

    await sendSms("+16195550100", "Hello there", "+16195559999");

    expect(getSmsProvider()).toBe("textbelt");
    expect(shouldAttachRetellSmsWebhook()).toBe(false);
    expect(global.fetch).toHaveBeenCalledWith(
      "https://textbelt.com/text",
      expect.objectContaining({
        method: "POST",
        body: expect.stringContaining("replyWebhookUrl=https%3A%2F%2Fringpaw.com%2Fapi%2Fsms%2Fwebhook"),
      })
    );
    expect(String((vi.mocked(global.fetch).mock.calls[0] || [])[1]?.body)).toContain(
      "webhookData=%2B16195559999"
    );
    expect(createMessage).not.toHaveBeenCalled();
  });
});
