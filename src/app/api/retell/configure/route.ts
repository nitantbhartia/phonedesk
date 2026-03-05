import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  syncRetellAgent,
} from "@/lib/retell";

export async function POST() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
    include: {
      services: { where: { isActive: true } },
      retellConfig: true,
    },
  });

  if (!business) {
    return NextResponse.json({ error: "Business not found" }, { status: 404 });
  }

  try {
    await syncRetellAgent(business);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error configuring Retell:", error);
    return NextResponse.json(
      { error: "Failed to configure voice agent" },
      { status: 500 }
    );
  }
}
