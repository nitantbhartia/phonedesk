import { NextResponse } from "next/server";
import { getOpeningsForCall, readToolPayload, requireToolSecret } from "@/lib/bland-tools";

export const runtime = "nodejs";

export async function POST(req: Request) {
  if (!requireToolSecret(req)) {
    return NextResponse.json({ ok: false, error: "Unauthorized" }, { status: 401 });
  }
  let body: unknown = {};
  try { body = await req.json(); }
  catch { return NextResponse.json({ ok: false, error: "Invalid JSON" }, { status: 400 }); }
  try {
    const result = await getOpeningsForCall(readToolPayload(body));
    return NextResponse.json(result);
  } catch (error) {
    console.error("[bland/openings] failed:", error);
    return NextResponse.json({ ok: false, error: "Could not load openings" }, { status: 500 });
  }
}
