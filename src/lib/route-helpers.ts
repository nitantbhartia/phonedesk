import { Prisma } from "@prisma/client";
import { getServerSession } from "next-auth";
import { NextResponse } from "next/server";
import { z, ZodType } from "zod";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type JsonRecord = Record<string, unknown>;

function firstZodMessage(error: z.ZodError) {
  return error.issues[0]?.message || "Invalid request";
}

export async function parseJsonBody<T>(
  req: Request,
  schema: ZodType<T>
): Promise<{ data: T } | { response: NextResponse<JsonRecord> }> {
  let body: unknown;

  try {
    body = await req.json();
  } catch {
    return {
      response: NextResponse.json(
        { error: "Request body must be valid JSON" },
        { status: 400 }
      ),
    };
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return {
      response: NextResponse.json(
        { error: firstZodMessage(parsed.error) },
        { status: 400 }
      ),
    };
  }

  return { data: parsed.data };
}

export async function requireCurrentUserId(): Promise<
  { userId: string } | { response: NextResponse<JsonRecord> }
> {
  const session = await getServerSession(authOptions);
  const sessionUser = session?.user;

  if (!sessionUser) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  if (sessionUser.id) {
    return { userId: sessionUser.id };
  }

  if (!sessionUser.email) {
    return {
      response: NextResponse.json({ error: "Unauthorized" }, { status: 401 }),
    };
  }

  const user = await prisma.user.upsert({
    where: { email: sessionUser.email },
    create: {
      email: sessionUser.email,
      name: sessionUser.name ?? undefined,
      image: sessionUser.image ?? undefined,
    },
    update: {
      name: sessionUser.name ?? undefined,
      image: sessionUser.image ?? undefined,
    },
  });

  return { userId: user.id };
}

export async function requireCurrentBusiness<T extends Prisma.BusinessFindUniqueArgs>(
  args?: Omit<T, "where">
): Promise<
  | { userId: string; business: Prisma.BusinessGetPayload<T> }
  | { response: NextResponse<JsonRecord> }
> {
  const userResult = await requireCurrentUserId();
  if ("response" in userResult) {
    return userResult;
  }

  const business = await prisma.business.findUnique({
    where: { userId: userResult.userId },
    ...(args ?? {}),
  } as Prisma.BusinessFindUniqueArgs) as Prisma.BusinessGetPayload<T> | null;

  if (!business) {
    return {
      response: NextResponse.json({ error: "No business" }, { status: 404 }),
    };
  }

  return {
    userId: userResult.userId,
    business,
  };
}

export function errorFromResponse(response: Response | JsonRecord) {
  if (response instanceof Response) {
    return response;
  }

  return NextResponse.json(response, { status: 400 });
}
