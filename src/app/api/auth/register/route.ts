import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { hashPassword, isPasswordStrongEnough, PASSWORD_REQUIREMENTS } from "@/lib/password";

function normalizeEmail(email?: string | null): string | null {
  const normalized = email?.trim().toLowerCase();
  return normalized || null;
}

export async function POST(req: Request) {
  let body: { name?: string; email?: string; password?: string };

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON payload." }, { status: 400 });
  }

  const name = body.name?.trim() || null;
  const email = normalizeEmail(body.email);
  const password = body.password || "";

  if (!email) {
    return NextResponse.json({ error: "Email is required." }, { status: 400 });
  }

  if (!isPasswordStrongEnough(password)) {
    return NextResponse.json(
      { error: `Password too weak. ${PASSWORD_REQUIREMENTS}` },
      { status: 400 },
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: { email },
  });

  if (existingUser) {
    return NextResponse.json(
      { error: "An account with that email already exists." },
      { status: 409 },
    );
  }

  const passwordHash = hashPassword(password);

  const user = await prisma.user.create({
    data: {
      name: name ?? undefined,
      email,
      passwordHash,
    },
  });

  return NextResponse.json({
    ok: true,
    user: {
      id: user.id,
      email: user.email,
      name: user.name,
    },
  });
}
