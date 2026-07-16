// Nutrition-label photo reading. The vision call extracts the per-serving
// numbers printed on the panel; the user reviews and can edit every value
// before anything is saved (same contract as quick-add estimates). Pure
// parsing stays testable; the provider loads lazily like the other AI paths.

import { validateEstimate, type MacroEstimate } from "./estimate";
import type { AIContentBlock } from "./types";

export const LABEL_MEDIA_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
export type LabelMediaType = (typeof LABEL_MEDIA_TYPES)[number];

// ~1.5 MB of base64 (~1.1 MB image), comfortably a downscaled phone photo.
export const LABEL_IMAGE_MAX_BASE64 = 1_500_000;

const SYSTEM = `You read nutrition facts labels from photos for a food logging app.
Extract the values AS PRINTED for ONE serving. Do not compute, convert, or estimate anything that is not printed; read the label exactly.

Rules:
- kcal is the Calories line. proteinG, carbsG (Total Carbohydrate), fatG (Total Fat) are in grams per serving.
- servingGrams: the gram or milliliter amount of one serving when printed (e.g. "2/3 cup (55g)" -> 55, "1 can (355mL)" -> 355). null when the label only names a household measure.
- servingText: the household serving description as printed (e.g. "2/3 cup"), null if absent.
- name: the product name if visible in the photo, else null.
- If the photo does not show a readable nutrition facts panel, respond with {"error": "unreadable"}.
- Never use em-dashes in any text.

Respond with ONLY valid JSON, no markdown fences:
{"name": "...", "servingGrams": 0, "servingText": "...", "kcal": 0, "proteinG": 0, "carbsG": 0, "fatG": 0}`;

export interface LabelReading extends MacroEstimate {
  servingGrams: number | null;
  servingText: string | null;
}

/** The exact message payload the vision model sees. */
export function buildLabelMessages(imageBase64: string, mediaType: LabelMediaType): AIContentBlock[] {
  return [
    {
      type: "image",
      source: { type: "base64", media_type: mediaType, data: imageBase64 },
    },
    { type: "text", text: "Read this nutrition facts label." },
  ];
}

/**
 * Parse and bound the model's reading. Null means unreadable or out of
 * bounds; the caller falls back to manual entry, never a made-up number.
 */
export function parseLabelResponse(raw: string): LabelReading | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) return null;

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(raw.slice(start, end + 1)) as Record<string, unknown>;
  } catch {
    return null;
  }
  if (typeof parsed.error === "string") return null;

  const checked = validateEstimate({
    name: typeof parsed.name === "string" && parsed.name.trim() ? parsed.name : "Label scan",
    kcal: parsed.kcal,
    proteinG: parsed.proteinG,
    carbsG: parsed.carbsG,
    fatG: parsed.fatG,
    assumptions: "",
  });
  if (!checked) return null;

  const servingGrams =
    typeof parsed.servingGrams === "number" &&
    Number.isFinite(parsed.servingGrams) &&
    parsed.servingGrams > 0 &&
    parsed.servingGrams <= 2000
      ? Math.round(parsed.servingGrams)
      : null;

  return {
    ...checked,
    servingGrams,
    servingText:
      typeof parsed.servingText === "string" && parsed.servingText.trim()
        ? parsed.servingText.trim().slice(0, 40)
        : null,
  };
}

/** Read a nutrition label photo. Null falls back to manual entry. */
export async function readNutritionLabel(
  imageBase64: string,
  mediaType: LabelMediaType,
): Promise<LabelReading | null> {
  try {
    const { getAIProvider } = await import("./anthropic");
    const raw = await getAIProvider().chat({
      system: SYSTEM,
      messages: [{ role: "user", content: buildLabelMessages(imageBase64, mediaType) }],
      maxTokens: 512,
    });
    return parseLabelResponse(raw);
  } catch (err) {
    console.error("readNutritionLabel: falling back to manual entry:", err);
    return null;
  }
}
