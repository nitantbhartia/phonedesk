import { NextResponse } from "next/server";
import { bookFromCall, readToolPayload, requireToolSecret } from "@/lib/bland-tools";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!requireToolSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }
  try {
    const result = await bookFromCall(readToolPayload(body));
    return NextResponse.json(result);
  } catch (error) {
    console.error("[bland/book] failed:", error);
    return NextResponse.json({ ok: false, error: "Could not book" }, { status: 500 });
  }
}
