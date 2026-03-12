import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  buildConfirmLink,
  generateAppointmentToken,
  verifyAppointmentToken,
} from "./appointment-token";

describe("appointment-token", () => {
  const originalSecret = process.env.NEXTAUTH_SECRET;
  const originalUrl = process.env.NEXT_PUBLIC_APP_URL;

  beforeEach(() => {
    process.env.NEXTAUTH_SECRET = "secret";
    process.env.NEXT_PUBLIC_APP_URL = "https://app.example.com";
  });

  afterEach(() => {
    process.env.NEXTAUTH_SECRET = originalSecret;
    process.env.NEXT_PUBLIC_APP_URL = originalUrl;
  });

  it("generates and verifies signed appointment tokens", () => {
    const token = generateAppointmentToken("appt_1", "confirm");

    expect(verifyAppointmentToken("appt_1", "confirm", token)).toBe(true);
    expect(verifyAppointmentToken("appt_1", "cancel", token)).toBe(false);
  });

  it("builds a signed confirm link", () => {
    expect(buildConfirmLink("appt_1")).toContain("https://app.example.com/api/appointments/confirm?id=appt_1&token=");
  });
});
