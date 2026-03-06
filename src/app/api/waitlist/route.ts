import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: List waitlist entries for the business
export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
  });

  if (!business) {
    return NextResponse.json({ error: "No business" }, { status: 404 });
  }

  const status = req.nextUrl.searchParams.get("status") || "WAITING";

  const entries = await prisma.waitlistEntry.findMany({
    where: {
      businessId: business.id,
      status: status as "WAITING" | "NOTIFIED" | "BOOKED" | "EXPIRED" | "DECLINED",
    },
    orderBy: { preferredDate: "asc" },
  });

  return NextResponse.json({ entries });
}

// POST: Add to waitlist (can be called by voice agent or dashboard)
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
  });

  if (!business) {
    return NextResponse.json({ error: "No business" }, { status: 404 });
  }

  const body = await req.json();
  const { customerName, customerPhone, petName, petBreed, petSize, serviceName, preferredDate, preferredTime, notes } = body;

  if (!customerName || !customerPhone || !preferredDate) {
    return NextResponse.json(
      { error: "customerName, customerPhone, and preferredDate are required" },
      { status: 400 }
    );
  }

  const entry = await prisma.waitlistEntry.create({
    data: {
      businessId: business.id,
      customerName,
      customerPhone,
      petName: petName || null,
      petBreed: petBreed || null,
      petSize: petSize || null,
      serviceName: serviceName || null,
      preferredDate: new Date(preferredDate),
      preferredTime: preferredTime || null,
      notes: notes || null,
    },
  });

  return NextResponse.json({ entry }, { status: 201 });
}

// DELETE: Remove from waitlist
export async function DELETE(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const id = req.nextUrl.searchParams.get("id");
  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
  });

  if (!business) {
    return NextResponse.json({ error: "No business" }, { status: 404 });
  }

  await prisma.waitlistEntry.deleteMany({
    where: { id, businessId: business.id },
  });

  return NextResponse.json({ success: true });
}
