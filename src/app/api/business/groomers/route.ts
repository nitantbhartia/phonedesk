import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { syncRetellAgent } from "@/lib/retell";
import { parseJsonBody, requireCurrentBusiness } from "@/lib/route-helpers";

const groomersSchema = z.object({
  groomers: z.array(
    z.object({
      id: z.string().trim().optional(),
      name: z.string().trim().min(1, "Groomer name is required").max(100),
      specialties: z.array(z.string().trim().min(1).max(100)).optional(),
    })
  ),
});

export async function GET() {
  const businessResult = await requireCurrentBusiness();
  if ("response" in businessResult) {
    return businessResult.response;
  }
  const { business } = businessResult;

  const groomers = await prisma.groomer.findMany({
    where: { businessId: business.id, isActive: true },
    orderBy: { createdAt: "asc" },
  });

  return NextResponse.json({ groomers });
}

export async function POST(req: NextRequest) {
  const businessResult = await requireCurrentBusiness();
  if ("response" in businessResult) {
    return businessResult.response;
  }
  const { business } = businessResult;

  const bodyResult = await parseJsonBody(req, groomersSchema);
  if ("response" in bodyResult) {
    return bodyResult.response;
  }
  const { groomers } = bodyResult.data;

  // Deactivate all existing groomers not in the new list
  const incomingIds = groomers.filter((g) => g.id).map((g) => g.id!);
  await prisma.groomer.updateMany({
    where: {
      businessId: business.id,
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
      const existingGroomer = await prisma.groomer.findFirst({
        where: { id: g.id, businessId: business.id },
      });

      if (!existingGroomer) {
        return NextResponse.json(
          { error: `Groomer not found: ${g.id}` },
          { status: 404 }
        );
      }

      const updated = await prisma.groomer.update({
        where: { id: g.id },
        data,
      });
      results.push(updated);
    } else {
      const created = await prisma.groomer.upsert({
        where: {
          businessId_name: {
            businessId: business.id,
            name: data.name,
          },
        },
        create: { businessId: business.id, ...data },
        update: data,
      });
      results.push(created);
    }
  }

  // Sync Retell so the AI knows about the groomers
  try {
    const businessForSync = await prisma.business.findUnique({
      where: { id: business.id },
      include: {
        services: { where: { isActive: true } },
        retellConfig: true,
        groomers: { where: { isActive: true } },
        breedRecommendations: { orderBy: { priority: "desc" } },
      },
    });
    if (businessForSync?.retellConfig) {
      await syncRetellAgent(businessForSync);
    }
  } catch (err) {
    console.error("[groomers] Failed to sync Retell:", err);
  }

  return NextResponse.json({ groomers: results });
}

export async function DELETE(req: NextRequest) {
  const businessResult = await requireCurrentBusiness();
  if ("response" in businessResult) {
    return businessResult.response;
  }
  const { business } = businessResult;

  const { searchParams } = new URL(req.url);
  const groomerId = searchParams.get("id");
  if (!groomerId) {
    return NextResponse.json({ error: "id is required" }, { status: 400 });
  }

  await prisma.groomer.updateMany({
    where: { id: groomerId, businessId: business.id },
    data: { isActive: false },
  });

  return NextResponse.json({ ok: true });
}
