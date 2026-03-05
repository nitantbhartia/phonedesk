import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { bookAppointment } from "@/lib/calendar";
import {
  sendBookingNotificationToOwner,
  sendBookingConfirmationToCustomer,
} from "@/lib/notifications";

// Retell custom tool endpoint: called by the voice agent during a call
// to book an appointment with the collected customer/pet details.
export async function POST(req: NextRequest) {
  const body = await req.json();
  const { args, call } = body;

  // Identify business from the called number
  const calledNumber = call?.to_number;
  const phoneNum = calledNumber
    ? await prisma.phoneNumber.findFirst({
        where: { number: calledNumber },
        include: { business: { include: { services: true } } },
      })
    : null;

  if (!phoneNum?.business) {
    return NextResponse.json({
      result: "I apologize, but I'm having trouble accessing the system right now. Let me take your information and have someone call you back.",
    });
  }

  const business = phoneNum.business;

  const {
    customer_name: customerName,
    customer_phone: customerPhone,
    pet_name: petName,
    pet_breed: petBreed,
    pet_size: petSize,
    service_name: svcName,
    start_time: startTime,
  } = args || {};

  const service = business.services.find(
    (s) =>
      s.isActive &&
      s.name.toLowerCase().includes((svcName || "").toLowerCase())
  );

  const start = new Date(startTime);
  const end = new Date(start.getTime() + (service?.duration || 60) * 60000);

  try {
    const appointment = await bookAppointment(business.id, {
      customerName,
      customerPhone: customerPhone || call?.from_number,
      petName,
      petBreed,
      petSize: petSize as "SMALL" | "MEDIUM" | "LARGE" | "XLARGE",
      serviceName: service?.name || svcName,
      servicePrice: service?.price,
      startTime: start,
      endTime: end,
    });

    // Link call to appointment
    if (call?.call_id) {
      await prisma.call.updateMany({
        where: { retellCallId: call.call_id },
        data: { appointmentId: appointment.id },
      });
    }

    // Send notifications
    const fullBusiness = await prisma.business.findUnique({
      where: { id: business.id },
      include: { phoneNumber: true },
    });

    if (fullBusiness) {
      await Promise.allSettled([
        sendBookingNotificationToOwner(
          fullBusiness as Parameters<typeof sendBookingNotificationToOwner>[0],
          appointment
        ),
        sendBookingConfirmationToCustomer(
          fullBusiness as Parameters<typeof sendBookingConfirmationToCustomer>[0],
          appointment
        ),
      ]);
    }

    const timeStr = start.toLocaleString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

    return NextResponse.json({
      result: `I've booked ${petName || "your pet"} for a ${service?.name || svcName || "grooming"} appointment on ${timeStr}. You'll receive a confirmation text shortly.`,
    });
  } catch (error) {
    console.error("Error booking appointment:", error);
    return NextResponse.json({
      result: "I wasn't able to complete the booking just now. Let me have the owner call you back to confirm.",
    });
  }
}
