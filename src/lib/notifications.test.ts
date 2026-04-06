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
  sendCancellationWithWaitlistNotification,
  sendMissedCallNotification,
  sendNoResponseFollowUp,
  sendOnMyWayReminder,
  sendRescheduleConfirmationToCustomer,
  sendRescheduleNotificationToOwner,
  sendWaitlistOpeningNotification,
} from "./notifications";

const business = {
  id: "biz_1",
  name: "Paw House",
  phone: "+16195550000",
  address: "123 Main St",
  timezone: "America/Los_Angeles",
  phoneNumber: { number: "+16195559999" },
};

const appointment = {
  id: "appt_1",
  customerName: "Jamie",
  customerPhone: "+16195550100",
  petName: "Bella",
  petBreed: "Poodle",
  petSize: "SMALL",
  serviceName: "Full Groom",
  startTime: new Date("2026-05-21T16:00:00.000Z"),
  status: "CONFIRMED",
  calendarEventId: "evt_1",
};

describe("notifications", () => {
  beforeEach(() => {
    vi.mocked(sendSms).mockReset();
    vi.mocked(prisma.appointment.update).mockReset();
    delete process.env.TWILIO_PHONE_NUMBER;
  });

  it("notifies the owner about a new booking", async () => {
    await sendBookingNotificationToOwner(business as never, appointment as never);

    expect(sendSms).toHaveBeenCalledWith(
      "+16195550000",
      expect.stringContaining("[RingPaw] New booking!"),
      "+16195559999"
    );
  });

  it("sends customer confirmations with reply-based confirm for pending appointments", async () => {
    await sendBookingConfirmationToCustomer(
      business as never,
      {
        ...appointment,
        status: "PENDING",
      } as never
    );

    expect(sendSms).toHaveBeenCalledWith(
      "+16195550100",
      expect.stringContaining("Reply CONFIRM to lock in your spot, or CANCEL to cancel."),
      "+16195559999"
    );
  });

  it("does not include any URLs in the customer confirmation SMS", async () => {
    await sendBookingConfirmationToCustomer(
      business as never,
      {
        ...appointment,
        status: "PENDING",
        confirmLink: "https://confirm.test/appt_1",
      } as never
    );

    const smsBody = vi.mocked(sendSms).mock.calls[0][1];
    expect(smsBody).not.toMatch(/https?:\/\//);
  });

  it("sends 'See you soon' instead of CONFIRM prompt for confirmed bookings", async () => {
    await sendBookingConfirmationToCustomer(
      business as never,
      { ...appointment, status: "CONFIRMED" } as never
    );

    const smsBody = vi.mocked(sendSms).mock.calls[0][1];
    expect(smsBody.toLowerCase()).toContain("confirm");
    expect(smsBody).not.toContain("Reply CONFIRM");
  });

  it("handles missed call notifications for both owner and caller", async () => {
    await sendMissedCallNotification(
      business as never,
      "+16195550100",
      "Jamie"
    );

    expect(sendSms).toHaveBeenNthCalledWith(
      1,
      "+16195550000",
      expect.stringContaining("Missed call"),
      "+16195559999"
    );
    expect(sendSms).toHaveBeenNthCalledWith(
      2,
      "+16195550100",
      expect.stringContaining("Sorry we missed your call"),
      "+16195559999"
    );
  });

  it("marks reminders as sent when sending customer reminders", async () => {
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

  it("sends waitlist and no-response messages", async () => {
    await sendWaitlistOpeningNotification(
      business as never,
      {
        customerPhone: "+16195550100",
        customerName: "Jamie",
        petName: "Bella",
        serviceName: "Bath",
      },
      "Thu, May 21, 9:00 AM"
    );
    await sendNoResponseFollowUp(business as never, appointment as never);

    expect(sendSms).toHaveBeenNthCalledWith(
      1,
      "+16195550100",
      expect.stringContaining("A spot just opened up"),
      "+16195559999"
    );
    expect(sendSms).toHaveBeenNthCalledWith(
      2,
      "+16195550100",
      expect.stringContaining("we haven't heard back"),
      "+16195559999"
    );
  });

  it("sends owner and customer reschedule updates", async () => {
    const newAppointment = {
      ...appointment,
      startTime: new Date("2026-05-22T16:00:00.000Z"),
      status: "PENDING",
    };

    await sendRescheduleNotificationToOwner(
      business as never,
      appointment as never,
      newAppointment as never,
      "Taylor"
    );
    await sendRescheduleConfirmationToCustomer(
      business as never,
      appointment as never,
      newAppointment as never
    );

    expect(sendSms).toHaveBeenNthCalledWith(
      1,
      "+16195550000",
      expect.stringContaining("Waitlist auto-fill: contacting Taylor"),
      "+16195559999"
    );
    expect(sendSms).toHaveBeenNthCalledWith(
      2,
      "+16195550100",
      expect.stringContaining("Reply CONFIRM to lock in the new time, or CANCEL to change it again."),
      "+16195559999"
    );
  });

  it("does not include any URLs in the reschedule confirmation SMS", async () => {
    const newAppointment = {
      ...appointment,
      startTime: new Date("2026-05-22T16:00:00.000Z"),
      status: "PENDING",
      confirmLink: "https://confirm.test/appt_1",
    };

    await sendRescheduleConfirmationToCustomer(
      business as never,
      appointment as never,
      newAppointment as never
    );

    const smsBody = vi.mocked(sendSms).mock.calls[0][1];
    expect(smsBody).not.toMatch(/https?:\/\//);
    expect(smsBody).toContain("Reply CONFIRM to lock in the new time");
  });

  it("includes waitlist details in cancellation notices when available", async () => {
    await sendCancellationWithWaitlistNotification(
      business as never,
      appointment as never,
      "Taylor"
    );

    expect(sendSms).toHaveBeenCalledWith(
      "+16195550000",
      expect.stringContaining("Waitlist auto-fill: contacting Taylor"),
      "+16195559999"
    );
  });
});
