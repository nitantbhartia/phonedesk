import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.email) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const user = await prisma.user.findUnique({
    where: { email: session.user.email },
    select: { business: { select: { id: true } } },
  });

  if (user?.business) {
    await prisma.demoSession.deleteMany({
      where: { businessId: user.business.id },
    });
  }

  return NextResponse.json({ ok: true });
}
