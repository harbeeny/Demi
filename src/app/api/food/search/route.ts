import { NextResponse } from "next/server";

import { loadContext } from "@/lib/plan/context";
import { preflight, withCors } from "@/lib/plan/cors";
import { consumeQuota, quotaExceeded } from "@/lib/plan/quota";
import { normalizeSearchHit, rankResults, type FdcFood, type RawSearchHit } from "@/lib/food/fdc";
import { correctQuery, fallbackQueries } from "@/lib/food/spell";

// USDA FoodData Central proxy. Auth required (loadContext) so the API key
// can't be farmed through us; the key itself never leaves the server.

const FDC_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const DATA_TYPES = "Foundation,SR Legacy,Branded,Survey (FNDDS)";
const CACHE_TTL_MS = 15 * 60 * 1000;
const CACHE_MAX = 100;
// Below this many results, a misspelling may be scraping junk hits; a
// dictionary correction that finds more takes over.
const SPARSE_RESULTS = 15;

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
  const { supabase } = ctx;

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
  if (cached) return NextResponse.json({ ...(cached as object), cached: true });

  // Cache miss: this hits the shared 1,000 req/hr USDA key. Meter per user so
  // one account cache-busting distinct queries can't drain the quota for all.
  if (!(await consumeQuota(supabase, "fdc"))) {
    return quotaExceeded("fdc");
  }

  const attempt = await fdcSearch(q, apiKey);
  if (!attempt.ok && attempt.status === 429) {
    return NextResponse.json(
      { error: "The food database is rate limited right now. Try again in a bit." },
      { status: 429 },
    );
  }

  // Zero results (or a still-failing original): try the smart variants, a
  // plural flip then dictionary spell correction, and say what we searched.
  let foods: FdcFood[] = attempt.ok ? attempt.foods : [];
  let correctedTo: string | null = null;
  if (foods.length === 0) {
    for (const variant of fallbackQueries(q)) {
      const rescue = await fdcSearch(variant, apiKey);
      if (rescue.ok && rescue.foods.length > 0) {
        foods = rescue.foods;
        correctedTo = variant;
        break;
      }
    }
  } else if (foods.length < SPARSE_RESULTS) {
    // A typo can still scrape up a few junk brand hits ("chiken" matches
    // brands that misspell chicken). When a spelling fix exists and finds a
    // richer set, prefer it.
    const fixed = correctQuery(q);
    if (fixed) {
      const rescue = await fdcSearch(fixed, apiKey);
      if (rescue.ok && rescue.foods.length > foods.length) {
        foods = rescue.foods;
        correctedTo = fixed;
      }
    }
  }

  if (!attempt.ok && foods.length === 0) {
    return NextResponse.json({ error: "Food database unreachable. Try again." }, { status: 502 });
  }

  const body = { foods, correctedTo };
  cacheSet(cacheKey, body);
  return NextResponse.json({ ...body, cached: false });
}

type FdcAttempt = { ok: true; foods: FdcFood[] } | { ok: false; status: number };

// The upstream API intermittently 400s valid queries, so every search gets
// one quiet retry after a beat; 429 is meaningful and is never retried.
async function fdcSearch(query: string, apiKey: string): Promise<FdcAttempt> {
  const first = await fdcSearchOnce(query, apiKey);
  if (first.ok || first.status === 429) return first;
  await new Promise((r) => setTimeout(r, 600));
  return fdcSearchOnce(query, apiKey);
}

async function fdcSearchOnce(query: string, apiKey: string): Promise<FdcAttempt> {
  const params = new URLSearchParams({
    query,
    dataType: DATA_TYPES,
    pageSize: "25",
  });

  let res: Response;
  try {
    res = await fetch(`${FDC_URL}?${params}`, {
      headers: { "X-Api-Key": apiKey },
    });
  } catch {
    return { ok: false, status: 0 };
  }
  if (!res.ok) return { ok: false, status: res.status };

  const data = (await res.json().catch(() => ({}))) as { foods?: RawSearchHit[] };
  return {
    ok: true,
    foods: rankResults(
      (data.foods ?? []).flatMap((hit) => {
        const food = normalizeSearchHit(hit);
        return food ? [food] : [];
      }),
    ),
  };
}

export const GET = withCors(get);
export const OPTIONS = preflight("GET, OPTIONS");
