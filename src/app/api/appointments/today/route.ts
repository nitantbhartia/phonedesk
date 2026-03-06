import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
  });

  if (!business) {
    return NextResponse.json({ appointments: [] });
  }

  const timezone = business.timezone || "America/Los_Angeles";
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date());
  const todayStart = new Date(`${todayStr}T00:00:00`);
  const todayEnd = new Date(`${todayStr}T23:59:59`);

  const appointments = await prisma.appointment.findMany({
    where: {
      businessId: business.id,
      startTime: { gte: todayStart, lte: todayEnd },
      status: { in: ["PENDING", "CONFIRMED", "COMPLETED"] },
    },
    orderBy: { startTime: "asc" },
    select: {
      id: true,
      customerName: true,
      customerPhone: true,
      petName: true,
      petBreed: true,
      serviceName: true,
      startTime: true,
      endTime: true,
      status: true,
      groomingStatus: true,
      groomingStatusAt: true,
    },
  });

  return NextResponse.json({ appointments });
}
