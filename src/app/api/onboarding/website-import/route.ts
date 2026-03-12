import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { importWebsiteDraft } from "@/lib/website-import";

const bodySchema = z.object({
  url: z.string().trim().min(3),
});

function isWebsiteImportEnabled() {
  return (
    process.env.ENABLE_WEBSITE_IMPORT === "true" ||
    process.env.NEXT_PUBLIC_ENABLE_WEBSITE_IMPORT === "true"
  );
}

export async function POST(req: NextRequest) {
  if (!isWebsiteImportEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const json = await req.json().catch(() => null);
  const body = bodySchema.safeParse(json);

  if (!body.success) {
    return NextResponse.json({ error: "A website URL is required." }, { status: 400 });
  }

  try {
    const draft = await importWebsiteDraft(body.data.url);
    const usefulData =
      draft.importedFields.length > 0 || draft.services.length > 0;

    if (!usefulData) {
      return NextResponse.json(
        {
          error:
            "We could not pull enough business details from that website. You can keep onboarding manually.",
        },
        { status: 422 }
      );
    }

    return NextResponse.json({ draft });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "We could not import that website right now.";
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
