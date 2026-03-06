import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET: Get review config (business.googleReviewUrl)
export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
    select: { id: true, googleReviewUrl: true },
  });

  if (!business) {
    return NextResponse.json({ error: "No business" }, { status: 404 });
  }

  return NextResponse.json({
    googleReviewUrl: business.googleReviewUrl,
  });
}

// POST: Update review config
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
  const { googleReviewUrl } = body;

  const updated = await prisma.business.update({
    where: { id: business.id },
    data: { googleReviewUrl: googleReviewUrl || null },
    select: { id: true, googleReviewUrl: true },
  });

  return NextResponse.json({
    googleReviewUrl: updated.googleReviewUrl,
  });
}
