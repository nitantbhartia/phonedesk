import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getConflicts } from "@/lib/calendar";

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
  const days = Math.min(parseInt(url.searchParams.get("days") || "3"), 7);

  const timezone = business.timezone || "America/Los_Angeles";
  const now = new Date();

  // Start from beginning of today in business timezone
  const todayStr = now.toLocaleDateString("en-CA", { timeZone: timezone });
  const dayStart = new Date(`${todayStr}T00:00:00`);
  // Approximate: shift by timezone offset. For accuracy we use the range end.
  const rangeEnd = new Date(dayStart.getTime() + days * 24 * 60 * 60 * 1000);

  try {
    const conflicts = await getConflicts(business.id, now, rangeEnd);
    return NextResponse.json({
      conflicts: conflicts.map((c) => ({
        start: c.start.toISOString(),
        end: c.end.toISOString(),
        summary: c.summary,
        source: c.source,
      })),
      timezone,
    });
  } catch (error) {
    console.error("Error fetching conflicts:", error);
    return NextResponse.json(
      { error: "Failed to fetch conflicts" },
      { status: 500 }
    );
  }
}
