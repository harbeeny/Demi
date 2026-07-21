/**
 * Coarse region for takeout planning. One value per user, overwritten on
 * change, so no location trail can exist by construction. GPS coordinates
 * are rounded to 2 decimal places (~1.1 km) HERE, before anything stores
 * or transmits them; precise coordinates never leave the request path.
 */
export type TakeoutRegion =
  | { source: "gps"; lat: number; lng: number }
  | { source: "typed"; area: string };

/** ~1.1 km cells: enough for "food near you", useless as a tracking point. */
export function coarsen(lat: number, lng: number): { lat: number; lng: number } {
  return { lat: Math.round(lat * 100) / 100, lng: Math.round(lng * 100) / 100 };
}

/** City or ZIP free text: trimmed, bounded, letters/digits/space/,/-/' only. */
export function normalizeArea(input: string): string | null {
  const area = input.trim().replace(/\s+/g, " ");
  if (area.length < 2 || area.length > 40) return null;
  if (!/^[\p{L}\p{N} ,.'-]+$/u.test(area)) return null;
  return area;
}

export function regionLabel(region: TakeoutRegion | null): string {
  if (!region) return "Add location";
  if (region.source === "gps") return "Using your rough location";
  return `Near ${region.area}`;
}

/** Validate a value read back from the DB (jsonb column, client-written). */
export function parseRegion(value: unknown): TakeoutRegion | null {
  if (typeof value !== "object" || value === null) return null;
  const v = value as Record<string, unknown>;
  if (v.source === "gps" && typeof v.lat === "number" && typeof v.lng === "number") {
    if (Math.abs(v.lat) <= 90 && Math.abs(v.lng) <= 180) {
      const { lat, lng } = coarsen(v.lat, v.lng);
      return { source: "gps", lat, lng };
    }
  }
  if (v.source === "typed" && typeof v.area === "string") {
    const area = normalizeArea(v.area);
    if (area) return { source: "typed", area };
  }
  return null;
}
