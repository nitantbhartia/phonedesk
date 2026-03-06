import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// GET: Get intake form by token (public - no auth)
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const form = await prisma.intakeForm.findUnique({
    where: { token },
    include: {
      business: {
        select: { name: true },
      },
    },
  });

  if (!form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  return NextResponse.json({
    form: {
      id: form.id,
      customerName: form.customerName,
      customerPhone: form.customerPhone,
      petName: form.petName,
      petBreed: form.petBreed,
      petAge: form.petAge,
      petWeight: form.petWeight,
      vaccinated: form.vaccinated,
      vetName: form.vetName,
      vetPhone: form.vetPhone,
      temperament: form.temperament,
      biteHistory: form.biteHistory,
      allergies: form.allergies,
      emergencyName: form.emergencyName,
      emergencyPhone: form.emergencyPhone,
      specialNotes: form.specialNotes,
      completed: form.completed,
    },
    businessName: form.business.name,
  });
}

// POST: Submit completed intake form (public - no auth)
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;

  const form = await prisma.intakeForm.findUnique({
    where: { token },
  });

  if (!form) {
    return NextResponse.json({ error: "Form not found" }, { status: 404 });
  }

  const data = await req.json();

  await prisma.intakeForm.update({
    where: { token },
    data: {
      petName: data.petName ?? undefined,
      petBreed: data.petBreed ?? undefined,
      petAge: data.petAge ?? undefined,
      petWeight: data.petWeight ?? undefined,
      vaccinated: data.vaccinated ?? undefined,
      vetName: data.vetName ?? undefined,
      vetPhone: data.vetPhone ?? undefined,
      temperament: data.temperament ?? undefined,
      biteHistory: data.biteHistory ?? undefined,
      allergies: data.allergies ?? undefined,
      emergencyName: data.emergencyName ?? undefined,
      emergencyPhone: data.emergencyPhone ?? undefined,
      specialNotes: data.specialNotes ?? undefined,
      completed: true,
    },
  });

  return NextResponse.json({ ok: true });
}
