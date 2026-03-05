import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
  });

  if (!business) {
    return NextResponse.json({ calls: [] });
  }

  const url = new URL(req.url);
  const limit = parseInt(url.searchParams.get("limit") || "50");
  const offset = parseInt(url.searchParams.get("offset") || "0");
  const status = url.searchParams.get("status");

  const where: Record<string, unknown> = { businessId: business.id };
  if (status) where.status = status;

  const [calls, total] = await Promise.all([
    prisma.call.findMany({
      where,
      include: {
        appointment: {
          select: {
            petName: true,
            serviceName: true,
            startTime: true,
            status: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
    prisma.call.count({ where }),
  ]);

  return NextResponse.json({ calls, total });
}
