import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { updateRetellPhoneNumber } from "@/lib/retell";
import { buildRetellWebhookUrl } from "@/lib/retell-auth";
import { shouldAttachRetellSmsWebhook } from "@/lib/sms";

/**
 * POST /api/admin/reassign-number
 *
 * Reassigns an existing Retell phone number from one business to another,
 * or releases it back to the pool (delete) when fromBusinessId is given alone.
 *
 * Body:
 *   { phoneNumber: "+16195551234", toBusinessId: "clx..." }
 *     — moves the number to toBusinessId's agent, removes it from its current business
 *
 * Auth: requires the ADMIN_SECRET env var sent as Bearer token.
 */
export async function POST(req: Request) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET is not configured" },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { phoneNumber?: string; toBusinessId?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { phoneNumber, toBusinessId } = body;

  if (!phoneNumber) {
    return NextResponse.json(
      { error: "phoneNumber is required" },
      { status: 400 }
    );
  }

  // Look up the number's current owner
  const existing = await prisma.phoneNumber.findUnique({
    where: { number: phoneNumber },
    include: { business: true },
  });

  if (!existing) {
    return NextResponse.json(
      { error: `Phone number ${phoneNumber} not found in database` },
      { status: 404 }
    );
  }

  const fromBusinessId = existing.businessId;

  // --- Reassign to a different business ---
  if (toBusinessId) {
    const toBusiness = await prisma.business.findUnique({
      where: { id: toBusinessId },
      include: {
        phoneNumber: true,
        retellConfig: true,
        services: { where: { isActive: true } },
        breedRecommendations: { orderBy: { priority: "desc" } },
      },
    });

    if (!toBusiness) {
      return NextResponse.json(
        { error: `Target business ${toBusinessId} not found` },
        { status: 404 }
      );
    }

    if (toBusiness.phoneNumber) {
      return NextResponse.json(
        {
          error: `Target business already has number ${toBusiness.phoneNumber.number}. Release it first.`,
        },
        { status: 409 }
      );
    }

    const toAgentId = toBusiness.retellConfig?.agentId;
    if (!toAgentId) {
      return NextResponse.json(
        {
          error: `Target business has no Retell agent configured. Run /api/retell/configure first.`,
        },
        { status: 422 }
      );
    }

    const appUrl = process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000";

    // Update Retell: point the number at the new business's agent
    await updateRetellPhoneNumber(phoneNumber, {
      inboundAgentId: toAgentId,
      nickname: `${toBusiness.name} - RingPaw`,
      smsWebhookUrl: shouldAttachRetellSmsWebhook()
        ? buildRetellWebhookUrl(appUrl, "/api/sms/webhook")
        : undefined,
    });

    // Update DB in a transaction: move the phoneNumber record
    await prisma.$transaction([
      prisma.phoneNumber.update({
        where: { number: phoneNumber },
        data: { businessId: toBusinessId },
      }),
      // Clear it from the old business (belt-and-suspenders)
      prisma.business.update({
        where: { id: fromBusinessId },
        data: { isActive: false },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      phoneNumber,
      from: fromBusinessId,
      to: toBusinessId,
      message: `${phoneNumber} reassigned from ${existing.business.name} → ${toBusiness.name}`,
    });
  }

  // --- No toBusinessId: just detach the number from the old business (release) ---
  // The number stays in Retell (still costs money) but is unlinked in DB.
  // Call DELETE /api/admin/reassign-number with { phoneNumber } to fully release.
  await prisma.phoneNumber.delete({ where: { number: phoneNumber } });

  return NextResponse.json({
    ok: true,
    phoneNumber,
    from: fromBusinessId,
    message: `${phoneNumber} detached from ${existing.business.name}. It remains active in Retell — reassign it to another business or delete it from the Retell dashboard.`,
  });
}

/**
 * DELETE /api/admin/reassign-number
 *
 * Fully releases a number: removes it from the DB and deletes it from Retell.
 * Body: { phoneNumber: "+16195551234" }
 */
export async function DELETE(req: Request) {
  const adminSecret = process.env.ADMIN_SECRET;
  if (!adminSecret) {
    return NextResponse.json(
      { error: "ADMIN_SECRET is not configured" },
      { status: 500 }
    );
  }

  const auth = req.headers.get("authorization") ?? "";
  if (auth !== `Bearer ${adminSecret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { phoneNumber?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { phoneNumber } = body;
  if (!phoneNumber) {
    return NextResponse.json(
      { error: "phoneNumber is required" },
      { status: 400 }
    );
  }

  const existing = await prisma.phoneNumber.findUnique({
    where: { number: phoneNumber },
  });

  if (existing) {
    await prisma.phoneNumber.delete({ where: { number: phoneNumber } });
  }

  // Delete from Retell (releases the number, stops billing)
  try {
    const { deleteRetellPhoneNumber } = await import("@/lib/retell");
    await deleteRetellPhoneNumber(phoneNumber);
  } catch (err) {
    console.error("[admin] Retell delete failed:", err);
    return NextResponse.json(
      {
        ok: false,
        warning: "Removed from DB but Retell deletion failed — delete manually in Retell dashboard",
        error: err instanceof Error ? err.message : String(err),
      },
      { status: 207 }
    );
  }

  return NextResponse.json({
    ok: true,
    phoneNumber,
    message: `${phoneNumber} fully released — removed from DB and Retell. Billing stops now.`,
  });
}
