import { afterEach, describe, expect, it } from "vitest";

import {
  getOwnerDashboardEmails,
  isOwnerDashboardEmail,
  isOwnerDashboardEmailClient,
} from "./owner-auth";

describe("owner-auth", () => {
  const originalOwnerEmails = process.env.OWNER_DASHBOARD_EMAILS;
  const originalOwnerEmail = process.env.OWNER_EMAIL;
  const originalPublic = process.env.NEXT_PUBLIC_OWNER_DASHBOARD_EMAILS;

  afterEach(() => {
    process.env.OWNER_DASHBOARD_EMAILS = originalOwnerEmails;
    process.env.OWNER_EMAIL = originalOwnerEmail;
    process.env.NEXT_PUBLIC_OWNER_DASHBOARD_EMAILS = originalPublic;
  });

  it("parses configured owner dashboard emails", () => {
    process.env.OWNER_DASHBOARD_EMAILS = " Owner@Example.com, second@example.com ";

    expect(getOwnerDashboardEmails()).toEqual(["owner@example.com", "second@example.com"]);
    expect(isOwnerDashboardEmail("OWNER@example.com")).toBe(true);
    expect(isOwnerDashboardEmail("nope@example.com")).toBe(false);
  });

  it("checks the public client-side list separately", () => {
    process.env.NEXT_PUBLIC_OWNER_DASHBOARD_EMAILS = "client@example.com";

    expect(isOwnerDashboardEmailClient("client@example.com")).toBe(true);
    expect(isOwnerDashboardEmailClient("other@example.com")).toBe(false);
  });
});
