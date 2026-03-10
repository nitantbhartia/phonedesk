import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("./prisma", () => ({
  prisma: {
    appointment: {
      update: vi.fn(),
    },
  },
}));

vi.mock("./sms", () => ({
  sendSms: vi.fn(),
}));

vi.mock("./utils", () => ({
  formatDateTime: vi.fn(() => "Thu, May 21, 9:00 AM"),
}));

import { prisma } from "./prisma";
import { sendSms } from "./sms";
import {
  send48hReminder,
  sendAppointmentReminder,
  sendBookingConfirmationToCustomer,
  sendBookingNotificationToOwner,
  sendMissedCallNotification,
  sendOnMyWayReminder,
} from "./notifications";

const business = {
  id: "biz_1",
  name: "Paw House",
  phone: "+16195550000",
  phoneNumber: { number: "+16195559999" },
  timezone: "America/Los_Angeles",
  address: "123 Main St",
};

const appointment = {
  id: "appt_1",
  customerName: "Jamie",
  customerPhone: "+16195550100",
  petName: "Buddy",
  petBreed: "Poodle",
  petSize: "MEDIUM",
  serviceName: "Full Groom",
  startTime: new Date("2026-05-21T16:00:00.000Z"),
  status: "CONFIRMED",
  confirmLink: "https://confirm.example.com",
};

describe("notifications", () => {
  beforeEach(() => {
    vi.mocked(sendSms).mockReset();
    vi.mocked(prisma.appointment.update).mockReset();
  });

  it("sends owner booking notifications with booking details", async () => {
    await sendBookingNotificationToOwner(business as never, appointment as never);

    expect(sendSms).toHaveBeenCalledWith(
      "+16195550000",
      expect.stringContaining("[RingPaw] New booking!"),
      "+16195559999"
    );
  });

  it("sends customer confirmations and includes confirm links for pending bookings", async () => {
    await sendBookingConfirmationToCustomer(
      business as never,
      { ...appointment, status: "PENDING" } as never
    );

    expect(sendSms).toHaveBeenCalledWith(
      "+16195550100",
      expect.stringContaining("Please confirm: https://confirm.example.com"),
      "+16195559999"
    );
  });

  it("sends missed-call notifications to both owner and caller", async () => {
    await sendMissedCallNotification(
      business as never,
      "+16195550100",
      "Jamie"
    );

    expect(sendSms).toHaveBeenNthCalledWith(
      1,
      "+16195550000",
      expect.stringContaining("Missed call - no booking made"),
      "+16195559999"
    );
    expect(sendSms).toHaveBeenNthCalledWith(
      2,
      "+16195550100",
      expect.stringContaining("Sorry we missed your call"),
      "+16195559999"
    );
  });

  it("marks reminder flags after sending timed reminders", async () => {
    await sendAppointmentReminder(business as never, appointment as never);
    await send48hReminder(business as never, appointment as never);
    await sendOnMyWayReminder(business as never, appointment as never);

    expect(prisma.appointment.update).toHaveBeenNthCalledWith(1, {
      where: { id: "appt_1" },
      data: { reminderSent: true },
    });
    expect(prisma.appointment.update).toHaveBeenNthCalledWith(2, {
      where: { id: "appt_1" },
      data: { reminder48hSent: true },
    });
    expect(prisma.appointment.update).toHaveBeenNthCalledWith(3, {
      where: { id: "appt_1" },
      data: { onMyWaySent: true },
    });
  });
});
