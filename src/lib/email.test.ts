import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();
const ResendCtor = vi.fn(() => ({
  emails: { send },
}));

vi.mock("resend", () => ({
  Resend: ResendCtor,
}));

describe("email helpers", () => {
  const originalApiKey = process.env.RESEND_API_KEY;
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    vi.resetModules();
    send.mockReset();
    ResendCtor.mockClear();
  });

  afterEach(() => {
    process.env.RESEND_API_KEY = originalApiKey;
    process.env.NODE_ENV = originalNodeEnv;
  });

  it("falls back to dev logging when RESEND_API_KEY is missing in development", async () => {
    delete process.env.RESEND_API_KEY;
    process.env.NODE_ENV = "development";
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const { sendEmail } = await import("./email");

    await sendEmail({
      to: "owner@example.com",
      subject: "Subject",
      html: "<p>Hello</p>",
      text: "Hello",
    });

    expect(send).not.toHaveBeenCalled();
    logSpy.mockRestore();
  });

  it("sends the demo magic link email through Resend when configured", async () => {
    process.env.RESEND_API_KEY = "re_test";
    process.env.NODE_ENV = "production";
    const { sendDemoMagicLink } = await import("./email");

    await sendDemoMagicLink({
      to: "owner@example.com",
      magicLink: "https://app.example.com/demo",
      businessName: "Paw House",
    });

    expect(send).toHaveBeenCalledWith(
      expect.objectContaining({
        to: "owner@example.com",
        subject: "Your RingPaw demo link",
      })
    );
  });
});
