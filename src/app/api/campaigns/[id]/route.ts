import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// DELETE: delete a campaign (only if DRAFT)
export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { id } = await params;

  const business = await prisma.business.findUnique({
    where: { userId: session.user.id },
  });
  if (!business) {
    return NextResponse.json({ error: "No business" }, { status: 404 });
  }

  const campaign = await prisma.campaign.findFirst({
    where: { id, businessId: business.id },
  });
  if (!campaign) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
