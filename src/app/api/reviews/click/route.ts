import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET (public): Track review link click and redirect to Google review URL
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const id = searchParams.get("id");

  if (!id) {
    return NextResponse.json({ error: "Missing id" }, { status: 400 });
  }

  const reviewRequest = await prisma.reviewRequest.findUnique({
    where: { id },
    include: {
      business: {
        select: { googleReviewUrl: true },
      },
    },
  });

  if (!reviewRequest || !reviewRequest.business.googleReviewUrl) {
    return NextResponse.json(
      { error: "Review request not found" },
      { status: 404 }
    );
  }

  // Track the click
  await prisma.reviewRequest.update({
    where: { id },
    data: {
      clicked: true,
      clickedAt: new Date(),
    },
  });

  // Redirect to the actual Google review URL
  return NextResponse.redirect(reviewRequest.business.googleReviewUrl);
}
