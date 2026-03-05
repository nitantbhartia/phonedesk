import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { bookAppointment } from "@/lib/calendar";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
  });

  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const body = await req.json();

  try {
    const appointment = await bookAppointment(business.id, {
      customerName: body.customerName,
      customerPhone: body.customerPhone,
      petName: body.petName,
      petBreed: body.petBreed,
      petSize: body.petSize,
      serviceName: body.serviceName,
      servicePrice: body.servicePrice,
      startTime: new Date(body.startTime),
      endTime: new Date(body.endTime),
      notes: body.notes,
    });

    return NextResponse.json({ appointment });
  } catch (error) {
    console.error("Error booking appointment:", error);
    return NextResponse.json(
      { error: "Failed to book appointment" },
      { status: 500 }
    );
  }
}
