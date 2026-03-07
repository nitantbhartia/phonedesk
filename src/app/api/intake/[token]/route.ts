import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

/** Sanitize a string field: trim, enforce max length, strip control characters */
function sanitizeString(value: unknown, maxLength = 500): string | undefined {
  if (value == null || typeof value !== "string") return undefined;
  // Strip control characters except newlines/tabs in specialNotes
  const cleaned = value.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "").trim();
  return cleaned.slice(0, maxLength) || undefined;
}

function sanitizeBool(value: unknown): boolean | undefined {
  if (value == null) return undefined;
  return value === true || value === "true";
}

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

  if (form.completed) {
    return NextResponse.json({ error: "Form already submitted" }, { status: 400 });
  }

  const data = await req.json();

  await prisma.intakeForm.update({
    where: { token },
    data: {
      petName: sanitizeString(data.petName, 100),
      petBreed: sanitizeString(data.petBreed, 100),
      petAge: sanitizeString(data.petAge, 50),
      petWeight: sanitizeString(data.petWeight, 50),
      vaccinated: sanitizeBool(data.vaccinated),
      vetName: sanitizeString(data.vetName, 200),
      vetPhone: sanitizeString(data.vetPhone, 30),
      temperament: sanitizeString(data.temperament, 200),
      biteHistory: sanitizeBool(data.biteHistory),
      allergies: sanitizeString(data.allergies, 500),
      emergencyName: sanitizeString(data.emergencyName, 200),
      emergencyPhone: sanitizeString(data.emergencyPhone, 30),
      specialNotes: sanitizeString(data.specialNotes, 2000),
      completed: true,
    },
  });

  return NextResponse.json({ ok: true });
}
