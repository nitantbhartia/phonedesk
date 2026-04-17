import { prisma } from "./prisma";
import { sendWaitlistOpeningNotification } from "./notifications";
import { formatDateTime } from "./utils";
type BusinessForWaitlist = {
  name: string;
  phone: string | null;
  phoneNumber: { number: string } | null;
};

type AppointmentForWaitlist = {
  id: string;
  businessId: string;
  startTime: Date;
  serviceName: string | null;
  business: BusinessForWaitlist;
};

const WAITLIST_HOLD_MINUTES = 30;

export async function tryFillFromWaitlist(appointment: AppointmentForWaitlist) {
  await expireStaleNotifications(appointment.businessId);

  const startOfDay = new Date(appointment.startTime);
  startOfDay.setHours(0, 0, 0, 0);
  const endOfDay = new Date(appointment.startTime);
  endOfDay.setHours(23, 59, 59, 999);

  const entries = await prisma.waitlistEntry.findMany({
    where: {
      businessId: appointment.businessId,
      status: "WAITING",
      preferredDate: { gte: startOfDay, lte: endOfDay },
    },
    orderBy: { createdAt: "asc" },
  });

  if (entries.length === 0) return null;

  const entry = entries[0];

  await prisma.waitlistEntry.update({
    where: { id: entry.id },
    data: { status: "NOTIFIED", notifiedAt: new Date() },
  });

  if (appointment.business.phoneNumber) {
    await sendWaitlistOpeningNotification(
      appointment.business as Parameters<typeof sendWaitlistOpeningNotification>[0],
      entry,
      formatDateTime(appointment.startTime)
    );
  }

  return entry;
}

async function expireStaleNotifications(businessId: string) {
  const cutoff = new Date(Date.now() - WAITLIST_HOLD_MINUTES * 60 * 1000);
  await prisma.waitlistEntry.updateMany({
    where: {
      businessId,
      status: "NOTIFIED",
      notifiedAt: { lt: cutoff },
    },
    data: { status: "EXPIRED" },
  });
}
