import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { google } from "googleapis";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const oauth2Client = new google.auth.OAuth2(
  process.env.GOOGLE_CLIENT_ID,
  process.env.GOOGLE_CLIENT_SECRET,
  `${process.env.NEXT_PUBLIC_APP_URL}/api/calendar/connect`
);

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const code = url.searchParams.get("code");
  const provider = url.searchParams.get("provider");
  const redirect = url.searchParams.get("redirect") || "/settings/calendar";
  const stateParam = url.searchParams.get("state");
  const appUrl = process.env.NEXT_PUBLIC_APP_URL!;

  const buildRedirectUrl = (path: string, params?: Record<string, string>) => {
    const target = new URL(path, appUrl);
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

  return NextResponse.redirect(
    buildRedirectUrl(redirectPath)
  );
}
