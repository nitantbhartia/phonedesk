import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { syncRetellAgent } from "@/lib/retell";

async function getBusinessId() {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email;
  if (!email) return null;

  const user = await prisma.user.findUnique({
    where: { email },
    include: { business: { select: { id: true } } },
  });

  return user?.business?.id ?? null;
}

export async function GET() {
  const businessId = await getBusinessId();
  if (!businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const groomers = await prisma.groomer.findMany({
    where: { businessId, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ groomers });
}

export async function POST(req: NextRequest) {
  const businessId = await getBusinessId();
  if (!businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await req.json();
  const { groomers } = body as {
    groomers: Array<{ id?: string; name: string; specialties?: string[] }>;
  };

  if (!Array.isArray(groomers)) {
    return NextResponse.json({ error: "groomers must be an array" }, { status: 400 });
  }

  // Deactivate all existing groomers not in the new list
  const incomingIds = groomers.filter((g) => g.id).map((g) => g.id!);
  await prisma.groomer.updateMany({
    where: {
      businessId,
      id: { notIn: incomingIds },
    },
    data: { isActive: false },
  });

  // Upsert each groomer
  const results = [];
  for (const g of groomers) {
    if (!g.name?.trim()) continue;

    const data = {
      name: g.name.trim().slice(0, 100),
      specialties: (g.specialties || []).map((s) => s.trim().slice(0, 100)).filter(Boolean),
      isActive: true,
    };

    if (g.id) {
      const updated = await prisma.groomer.update({
        where: { id: g.id },
        data,
      });
      results.push(updated);
    } else {
      const created = await prisma.groomer.upsert({
        where: {
          businessId_name: {
            businessId,
            name: data.name,
          },
        },
        create: { businessId, ...data },
        update: data,
      });
      results.push(created);
    }
  }

  // Sync Retell so the AI knows about the groomers
  try {
    const business = await prisma.business.findUnique({
      where: { id: businessId },
      include: {
        services: { where: { isActive: true } },
        retellConfig: true,
        groomers: { where: { isActive: true } },
        breedRecommendations: { orderBy: { priority: "desc" } },
      },
    });
    if (business?.retellConfig) {
      await syncRetellAgent(business);
    }
  } catch (err) {
    console.error("[groomers] Failed to sync Retell:", err);
  }

  return NextResponse.json({ groomers: results });
}

export async function DELETE(req: NextRequest) {
  const businessId = await getBusinessId();
  if (!businessId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const groomerId = searchParams.get("id");
  if (!groomerId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await prisma.groomer.updateMany({
    where: { id: groomerId, businessId },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
