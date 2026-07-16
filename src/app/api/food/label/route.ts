import { NextResponse } from "next/server";

import { loadContext } from "@/lib/plan/context";
import { preflight, withCors } from "@/lib/plan/cors";
import { consumeQuota, quotaExceeded } from "@/lib/plan/quota";
import {
  LABEL_IMAGE_MAX_BASE64,
  LABEL_MEDIA_TYPES,
  readNutritionLabel,
  type LabelMediaType,
} from "@/lib/ai/label";

// Photograph-the-label fallback for foods no database carries. The vision
// model reads the printed per-serving values; the client shows them in the
// editable quick-add form, so nothing is saved sight-unseen.

async function post(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;
  const { supabase } = ctx;

  const body = (await request.json().catch(() => ({}))) as {
    image?: string;
    mediaType?: string;
  };

  const mediaType = LABEL_MEDIA_TYPES.find((t) => t === body.mediaType) as
    | LabelMediaType
    | undefined;
  if (!mediaType) {
    return NextResponse.json({ error: "Unsupported image type." }, { status: 400 });
  }

  // Raw base64 only (no data: prefix); size-capped before it goes anywhere.
  const image = typeof body.image === "string" ? body.image.replace(/\s/g, "") : "";
  if (image.length === 0 || image.length > LABEL_IMAGE_MAX_BASE64 || !/^[A-Za-z0-9+/=]+$/.test(image)) {
    return NextResponse.json({ error: "That photo couldn't be used. Try again." }, { status: 400 });
  }

  // A vision call is billable LLM work; same per-user meter as the rest.
  if (!(await consumeQuota(supabase, "llm"))) {
    return quotaExceeded("llm");
  }

  const reading = await readNutritionLabel(image, mediaType);
  if (!reading) {
    return NextResponse.json(
      { error: "Couldn't read that label. Try a straight-on, well-lit shot, or enter the numbers yourself.", manual: true },
      { status: 422 },
    );
  }

  return NextResponse.json({ reading, isEstimate: true });
}

export const POST = withCors(post);
export const OPTIONS = preflight("POST, OPTIONS");
