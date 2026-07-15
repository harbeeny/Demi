import { NextResponse } from "next/server";

import { loadContext } from "@/lib/plan/context";
import { preflight, withCors } from "@/lib/plan/cors";
import { normalizeSearchHit, rankResults, type RawSearchHit } from "@/lib/food/fdc";

// USDA FoodData Central proxy. Auth required (loadContext) so the API key
// can't be farmed through us; the key itself never leaves the server.

const FDC_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const DATA_TYPES = "Foundation,SR Legacy,Branded,Survey (FNDDS)";
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 100;

// Module-scope cache: survives between invocations on a warm serverless
// instance, quietly resets on cold starts. Good enough to be polite to the
// 1,000 req/hr key limit at this app's scale.
const cache = new Map<string, { at: number; body: unknown }>();

function cacheGet(key: string): unknown | null {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) {
    cache.delete(key);
    return null;
  }
  // refresh LRU position
  cache.delete(key);
  cache.set(key, hit);
  return hit.body;
}

function cacheSet(key: string, body: unknown) {
  cache.set(key, { at: Date.now(), body });
  while (cache.size > CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

async function get(request: Request): Promise<Response> {
  const ctx = await loadContext(request);
  if ("error" in ctx) return ctx.error;

  const apiKey = process.env.FDC_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Food search isn't configured yet (missing FDC_API_KEY)." },
      { status: 503 },
    );
  }

  const q = new URL(request.url).searchParams.get("q")?.trim().slice(0, 80) ?? "";
  if (q.length < 2) {
    return NextResponse.json({ error: "Type at least two characters." }, { status: 400 });
  }

  const cacheKey = q.toLowerCase();
  const cached = cacheGet(cacheKey);
  if (cached) return NextResponse.json({ foods: cached, cached: true });

  const params = new URLSearchParams({
    query: q,
    dataType: DATA_TYPES,
    pageSize: "25",
  });

  let res: Response;
  try {
    res = await fetch(`${FDC_URL}?${params}`, {
      headers: { "X-Api-Key": apiKey },
    });
  } catch {
    return NextResponse.json({ error: "Food database unreachable. Try again." }, { status: 502 });
  }

  if (res.status === 429) {
    return NextResponse.json(
      { error: "The food database is rate limited right now. Try again in a bit." },
      { status: 429 },
    );
  }
  if (!res.ok) {
    return NextResponse.json({ error: "Food search failed. Try again." }, { status: 502 });
  }

  const data = (await res.json()) as { foods?: RawSearchHit[] };
  const foods = rankResults(
    (data.foods ?? []).flatMap((hit) => {
      const food = normalizeSearchHit(hit);
      return food ? [food] : [];
    }),
  );

  cacheSet(cacheKey, foods);
  return NextResponse.json({ foods, cached: false });
}

export const GET = withCors(get);
export const OPTIONS = preflight("GET, OPTIONS");
