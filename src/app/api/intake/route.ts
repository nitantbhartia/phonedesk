import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/sms";

// POST: Create an intake form for a customer and send SMS with link
export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
    include: { phoneNumber: true },
  });

  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  const { customerPhone, customerName, appointmentId } = await req.json();

  if (!customerPhone || !customerName) {
    return NextResponse.json(
      { error: "customerPhone and customerName are required" },
      { status: 400 }
    );
  }

  const intakeForm = await prisma.intakeForm.create({
    data: {
      businessId: business.id,
      customerPhone,
      customerName,
      appointmentId: appointmentId || undefined,
    },
  });

  // Send SMS with intake link
  const appUrl =
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";
  const intakeLink = `${appUrl}/intake/${intakeForm.token}`;
  const message = `Hi ${customerName}! Please fill out this quick form before your visit to ${business.name}: ${intakeLink}`;

  if (business.phoneNumber?.number) {
    try {
      await sendSms(customerPhone, message, business.phoneNumber.number);
    } catch (error) {
      console.error("Failed to send intake SMS:", error);
    }
  }

  return NextResponse.json({
    ok: true,
    intakeId: intakeForm.id,
    token: intakeForm.token,
  });
}

// GET: List intake forms for the business
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
  });

  if (!business) {
    return NextResponse.json({ forms: [] });
  }

  const forms = await prisma.intakeForm.findMany({
    where: { businessId: business.id },
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ forms });
}
