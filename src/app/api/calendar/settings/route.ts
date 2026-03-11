import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseJsonBody, requireCurrentBusiness } from "@/lib/route-helpers";
import { prisma } from "@/lib/prisma";

const calendarSettingsSchema = z.object({
  primaryConnectionId: z
    .string()
    .trim()
    .min(1, "primaryConnectionId is required"),
});

export async function PATCH(req: NextRequest) {
  const businessResult = await requireCurrentBusiness({
    include: {
      calendarConnections: {
        where: { isActive: true },
        select: { id: true },
      },
    },
  });
  if ("response" in businessResult) {
    return businessResult.response;
  }

  const bodyResult = await parseJsonBody(req, calendarSettingsSchema);
  if ("response" in bodyResult) {
    return bodyResult.response;
  }

  const { business } = businessResult;
  const { primaryConnectionId } = bodyResult.data;

  const ownsConnection = business.calendarConnections.some(
    (connection) => connection.id === primaryConnectionId
  );

  if (!ownsConnection) {
    return NextResponse.json(
      { error: "Primary destination must be one of your active calendar connections" },
      { status: 400 }
    );
  }

  await prisma.calendarConnection.updateMany({
    where: { businessId: business.id },
    data: { isPrimary: false },
  });

  await prisma.calendarConnection.update({
    where: { id: primaryConnectionId },
    data: { isPrimary: true },
  });

  return NextResponse.json({
    ok: true,
    message: "Primary booking destination updated",
  });
}
