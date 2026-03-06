import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendSms } from "@/lib/retell";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
    include: { phoneNumber: true },
  });

  if (!business?.phoneNumber) {
    return NextResponse.json({ error: "No phone number configured" }, { status: 400 });
  }

  const body = await req.json();
  const { customerPhones } = body as { customerPhones: string[] };

  if (!customerPhones?.length) {
    return NextResponse.json({ error: "No customers provided" }, { status: 400 });
  }

  const fromNumber = business.phoneNumber.number;
  const results: { phone: string; success: boolean }[] = [];

  for (const phone of customerPhones) {
    try {
      const message = [
        `Hi! It's been a while since ${business.name} last saw your pup.`,
        `Ready to book your next grooming appointment? Just reply BOOK and our AI will get you scheduled right away.`,
        `Or call us anytime — we'd love to see you soon! 🐾`,
      ].join(" ");

      await sendSms(phone, message, fromNumber);
      results.push({ phone, success: true });
    } catch {
      results.push({ phone, success: false });
    }
  }

  const sent = results.filter((r) => r.success).length;
  return NextResponse.json({ sent, total: customerPhones.length, results });
}
