import { prisma } from "@/lib/prisma";

export type CalendarHealth = {
  connected: boolean;
  provider: string | null;
  canReadBusy: boolean;
  canWriteEvents: boolean;
  tokenHealthy: boolean;
  message: string;
  forceRequestMode: boolean;
};

function tokenLooksHealthy(expiresAt: Date | null | undefined) {
  if (!expiresAt) return true;
  return expiresAt.getTime() > Date.now() + 5 * 60 * 1000;
}

export async function getCalendarHealth(businessId: string): Promise<CalendarHealth> {
  const connection = await prisma.calendarConnection.findFirst({
    where: { businessId, isPrimary: true, isActive: true },
    orderBy: { updatedAt: "desc" },
  });

  if (!connection) {
    return {
      connected: false,
      provider: null,
      canReadBusy: false,
      canWriteEvents: false,
      tokenHealthy: false,
      message: "Connect Google Calendar to offer real openings.",
      forceRequestMode: true,
    };
  }

  const tokenHealthy = tokenLooksHealthy(connection.tokenExpiry);
  const hasToken = Boolean(connection.accessToken);
  const canReadBusy = hasToken && tokenHealthy;
  const writeCapable = ["GOOGLE", "SQUARE", "ACUITY"].includes(connection.provider);
  const canWriteEvents = writeCapable && hasToken && tokenHealthy;

  let message = "Calendar connected.";
  if (!tokenHealthy) {
    message = "Calendar token expired — reconnect to read busy times and write bookings.";
  } else if (!canWriteEvents && connection.provider === "GOOGLE") {
    message = "Calendar connected for busy times only — bookings will be requests until write access is restored.";
  } else if (canWriteEvents) {
    message = "Calendar can read busy times and write confirmed bookings.";
  }

  return {
    connected: true,
    provider: connection.provider,
    canReadBusy,
    canWriteEvents,
    tokenHealthy,
    message,
    forceRequestMode: !canWriteEvents,
  };
}
