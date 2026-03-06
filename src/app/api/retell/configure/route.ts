import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  syncRetellAgent,
} from "@/lib/retell";

async function resolveUserId(session: {
  user?: {
    id?: string | null;
    email?: string | null;
    name?: string | null;
    image?: string | null;
  };
}) {
  const email = session.user?.email;

  if (!email) {
    return session.user?.id ?? null;
  }

  const user = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: session.user?.name ?? undefined,
      image: session.user?.image ?? undefined,
    },
    update: {
      name: session.user?.name ?? undefined,
      image: session.user?.image ?? undefined,
    },
  });

  return user.id;
}

export async function POST() {
  const session = await getServerSession(authOptions);
  const userId = session ? await resolveUserId(session) : null;

  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId },
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
