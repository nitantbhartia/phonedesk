import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAvailableSlots } from "@/lib/calendar";

export async function GET(req: NextRequest) {
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

  const url = new URL(req.url);
  const dateStr = url.searchParams.get("date");
  const duration = parseInt(url.searchParams.get("duration") || "60");

  const date = dateStr ? new Date(dateStr) : new Date();

  try {
    const slots = await getAvailableSlots(business.id, date, duration);
    return NextResponse.json({ slots });
  } catch (error) {
    console.error("Error fetching availability:", error);
    return NextResponse.json(
      { error: "Failed to fetch availability" },
      { status: 500 }
    );
  }
}
