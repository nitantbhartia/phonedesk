import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function getBaseAppUrl(req: NextRequest) {
  return (
    process.env.NEXTAUTH_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    req.nextUrl.origin
  );
}

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const provider = url.searchParams.get("provider");
  const redirect = url.searchParams.get("redirect") || "/settings/calendar";
  const stateParam = url.searchParams.get("state");
  const appUrl = getBaseAppUrl(req);
  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${appUrl}/api/calendar/connect`
  );

  const buildRedirectUrl = (path: string, params?: Record<string, string>) => {
    // Prevent open redirect: only allow relative paths, not absolute URLs
    const safePath = path.startsWith("/") ? path : `/settings/calendar`;
    const target = new URL(safePath, appUrl);
    // Double-check the origin matches to prevent protocol-relative redirects
    const base = new URL(appUrl);
    if (target.origin !== base.origin) {
      return new URL("/settings/calendar", appUrl);
    }
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        target.searchParams.set(key, value);
      }
    }
    return target;
  };

  // If no code, redirect to OAuth
  if (!code) {
    if (provider === "google") {
      const authUrl = oauth2Client.generateAuthUrl({
        access_type: "offline",
        prompt: "consent",
        scope: [
          "https://www.googleapis.com/auth/calendar",
          "https://www.googleapis.com/auth/calendar.events",
        ],
        state: JSON.stringify({ redirect, provider }),
      });
      return NextResponse.redirect(authUrl);
    }

    if (provider === "square") {
      const squareBaseUrl = process.env.SQUARE_ENVIRONMENT === "production"
        ? "https://connect.squareup.com"
        : "https://connect.squareupsandbox.com";
      const squareAuthUrl = new URL(`${squareBaseUrl}/oauth2/authorize`);
      squareAuthUrl.searchParams.set("client_id", process.env.SQUARE_APP_ID || "");
      squareAuthUrl.searchParams.set("scope", "APPOINTMENTS_READ APPOINTMENTS_WRITE APPOINTMENTS_ALL_READ APPOINTMENTS_ALL_WRITE MERCHANT_PROFILE_READ CUSTOMERS_READ CUSTOMERS_WRITE CATALOG_READ");
      squareAuthUrl.searchParams.set("session", "false");
      squareAuthUrl.searchParams.set(
        "state",
        JSON.stringify({ redirect, provider: "square" })
      );
      squareAuthUrl.searchParams.set(
        "redirect_uri",
        `${appUrl}/api/calendar/connect`
      );
      return NextResponse.redirect(squareAuthUrl.toString());
    }

    if (provider === "acuity") {
      const acuityAuthUrl = new URL("https://acuityscheduling.com/oauth2/authorize");
      acuityAuthUrl.searchParams.set("response_type", "code");
      acuityAuthUrl.searchParams.set("client_id", process.env.ACUITY_CLIENT_ID || "");
      acuityAuthUrl.searchParams.set("redirect_uri", `${appUrl}/api/calendar/connect`);
      acuityAuthUrl.searchParams.set("scope", "api-v1");
      acuityAuthUrl.searchParams.set(
        "state",
        JSON.stringify({ redirect, provider: "acuity" })
      );
      return NextResponse.redirect(acuityAuthUrl.toString());
    }

    return NextResponse.json(
      { error: "Unsupported calendar provider" },
      { status: 400 }
    );
  }

  // Handle OAuth callback
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.redirect(buildRedirectUrl("/"));
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
  });

  if (!business) {
    return NextResponse.redirect(buildRedirectUrl("/onboarding"));
  }

  let parsedState: { redirect?: string; provider?: string } = {};
  try {
    if (stateParam) parsedState = JSON.parse(stateParam);
  } catch {
    // ignore
  }

  const calendarProvider = parsedState.provider || "google";
  const redirectPath = parsedState.redirect || redirect;

  if (calendarProvider === "google") {
    try {
      const { tokens } = await oauth2Client.getToken(code);

      // Get calendar list to find primary calendar ID
      oauth2Client.setCredentials(tokens);
      const calendar = google.calendar({ version: "v3", auth: oauth2Client });
      const calendarList = await calendar.calendarList.list();
      const primaryCal = calendarList.data.items?.find(
        (c) => c.primary
      );

      // Check if already connected
      const existing = await prisma.calendarConnection.findFirst({
        where: {
          businessId: business.id,
          provider: "GOOGLE",
        },
      });

      if (existing) {
        await prisma.calendarConnection.update({
          where: { id: existing.id },
          data: {
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token || existing.refreshToken,
            tokenExpiry: tokens.expiry_date
              ? new Date(tokens.expiry_date)
              : null,
            calendarId: primaryCal?.id || "primary",
            isActive: true,
          },
        });
      } else {
        // Count existing connections
        const connectionCount = await prisma.calendarConnection.count({
          where: { businessId: business.id, isActive: true },
        });

        await prisma.calendarConnection.create({
          data: {
            businessId: business.id,
            provider: "GOOGLE",
            isPrimary: connectionCount === 0, // First connection is primary
            accessToken: tokens.access_token,
            refreshToken: tokens.refresh_token,
            tokenExpiry: tokens.expiry_date
              ? new Date(tokens.expiry_date)
              : null,
            calendarId: primaryCal?.id || "primary",
          },
        });
      }

      return NextResponse.redirect(
        buildRedirectUrl(redirectPath)
      );
    } catch (error) {
      console.error("Google Calendar OAuth error:", error);
      return NextResponse.redirect(
        buildRedirectUrl(redirectPath, {
          error: "calendar_connect_failed",
        })
      );
    }
  }

  if (calendarProvider === "square") {
    try {
      const squareBaseUrl = process.env.SQUARE_ENVIRONMENT === "production"
        ? "https://connect.squareup.com"
        : "https://connect.squareupsandbox.com";

      // Exchange code for access token
      const tokenRes = await fetch(`${squareBaseUrl}/oauth2/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          client_id: process.env.SQUARE_APP_ID,
          client_secret: process.env.SQUARE_APP_SECRET,
          code,
          grant_type: "authorization_code",
          redirect_uri: `${appUrl}/api/calendar/connect`,
        }),
      });

      if (!tokenRes.ok) throw new Error("Square token exchange failed");
      const tokens = await tokenRes.json();

      // Get merchant's primary location
      const locRes = await fetch(`${squareBaseUrl}/v2/locations`, {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
          "Square-Version": "2024-10-17",
        },
      });
      const locData = await locRes.json();
      const primaryLocation = locData.locations?.[0];

      const existing = await prisma.calendarConnection.findFirst({
        where: { businessId: business.id, provider: "SQUARE" },
      });

      const connectionData = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        tokenExpiry: tokens.expires_at ? new Date(tokens.expires_at) : null,
        calendarId: primaryLocation?.id || null,
        metadata: {
          locationId: primaryLocation?.id,
          merchantId: tokens.merchant_id,
          locationName: primaryLocation?.name,
        },
        isActive: true,
      };

      if (existing) {
        await prisma.calendarConnection.update({
          where: { id: existing.id },
          data: connectionData,
        });
      } else {
        const connectionCount = await prisma.calendarConnection.count({
          where: { businessId: business.id, isActive: true },
        });
        await prisma.calendarConnection.create({
          data: {
            businessId: business.id,
            provider: "SQUARE",
            isPrimary: connectionCount === 0,
            ...connectionData,
          },
        });
      }

      return NextResponse.redirect(buildRedirectUrl(redirectPath));
    } catch (error) {
      console.error("Square OAuth error:", error);
      return NextResponse.redirect(
        buildRedirectUrl(redirectPath, { error: "calendar_connect_failed" })
      );
    }
  }

  if (calendarProvider === "acuity") {
    try {
      // Exchange code for access token
      const tokenRes = await fetch(
        "https://acuityscheduling.com/oauth2/token",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            grant_type: "authorization_code",
            code,
            client_id: process.env.ACUITY_CLIENT_ID,
            client_secret: process.env.ACUITY_CLIENT_SECRET,
            redirect_uri: `${appUrl}/api/calendar/connect`,
          }),
        }
      );

      if (!tokenRes.ok) throw new Error("Acuity token exchange failed");
      const tokens = await tokenRes.json();

      // Get the user's account info
      const meRes = await fetch("https://acuityscheduling.com/api/v1/me", {
        headers: {
          Authorization: `Bearer ${tokens.access_token}`,
        },
      });
      const meData = meRes.ok ? await meRes.json() : {};

      // Get appointment types to store default
      const typesRes = await fetch(
        "https://acuityscheduling.com/api/v1/appointment-types",
        {
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
          },
        }
      );
      const appointmentTypes = typesRes.ok ? await typesRes.json() : [];

      const existing = await prisma.calendarConnection.findFirst({
        where: { businessId: business.id, provider: "ACUITY" },
      });

      const connectionData = {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || null,
        tokenExpiry: null as Date | null,
        calendarId: String(meData.id || ""),
        metadata: {
          userId: meData.id,
          email: meData.email,
          appointmentTypeId: appointmentTypes[0]?.id || null,
        },
        isActive: true,
      };

      if (existing) {
        await prisma.calendarConnection.update({
          where: { id: existing.id },
          data: connectionData,
        });
      } else {
        const connectionCount = await prisma.calendarConnection.count({
          where: { businessId: business.id, isActive: true },
        });
        await prisma.calendarConnection.create({
          data: {
            businessId: business.id,
            provider: "ACUITY",
            isPrimary: connectionCount === 0,
            ...connectionData,
          },
        });
      }

      return NextResponse.redirect(buildRedirectUrl(redirectPath));
    } catch (error) {
      console.error("Acuity OAuth error:", error);
      return NextResponse.redirect(
        buildRedirectUrl(redirectPath, { error: "calendar_connect_failed" })
      );
    }
  }

  return NextResponse.redirect(
    buildRedirectUrl(redirectPath)
  );
}

// DELETE: Disconnect a calendar provider
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const provider = req.nextUrl.searchParams.get("provider")?.toUpperCase();
  if (!provider) {
    return NextResponse.json({ error: "Missing provider" }, { status: 400 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
  });

  if (!business) {
    return NextResponse.json({ error: "No business" }, { status: 404 });
  }

  await prisma.calendarConnection.updateMany({
    where: {
      businessId: business.id,
      provider: provider as "GOOGLE" | "SQUARE" | "ACUITY",
    },
    data: { isActive: false, accessToken: null, refreshToken: null },
  });

  return NextResponse.json({ success: true });
}
