import { describe, expect, test } from "bun:test";

import { buildTakeoutSearchUrl, PROVIDER_HOMEPAGES, TAKEOUT_PROVIDERS } from "./deeplinks";

// These URL shapes are unversioned upstream (not official APIs). The tests
// pin what WE guarantee: well-formed https URLs with the dish correctly
// percent-encoded, so a breakage after an upstream change is loud here.

describe("buildTakeoutSearchUrl", () => {
  test("doordash: dish lands percent-encoded in the search path", () => {
    const url = buildTakeoutSearchUrl("doordash", "Chicken burrito bowl");
    expect(url).toBe("https://www.doordash.com/search/store/Chicken%20burrito%20bowl/");
    const parsed = new URL(url);
    expect(parsed.protocol).toBe("https:");
    expect(parsed.hostname).toBe("www.doordash.com");
    expect(decodeURIComponent(parsed.pathname)).toBe("/search/store/Chicken burrito bowl/");
  });

  test("ubereats: dish lands in the q param", () => {
    const url = buildTakeoutSearchUrl("ubereats", "Turkey meatballs with whole-wheat pasta");
    const parsed = new URL(url);
    expect(parsed.hostname).toBe("www.ubereats.com");
    expect(parsed.pathname).toBe("/search");
    expect(parsed.searchParams.get("q")).toBe("Turkey meatballs with whole-wheat pasta");
  });

  test("reserved and unicode characters never leak into URL structure", () => {
    const dish = "Mac & cheese / extra-crispy? 50% (jalapeño) #spicy";
    for (const { id } of TAKEOUT_PROVIDERS) {
      const url = buildTakeoutSearchUrl(id, dish);
      const parsed = new URL(url);
      // a raw &, ?, or # in the encoded segment would split the URL apart
      expect(url).not.toContain("#");
      expect(parsed.hash).toBe("");
      const roundTripped =
        id === "doordash"
          ? decodeURIComponent(parsed.pathname.split("/")[3])
          : parsed.searchParams.get("q");
      expect(roundTripped).toBe(dish);
    }
  });

  test("surrounding whitespace is trimmed before encoding", () => {
    expect(buildTakeoutSearchUrl("doordash", "  tacos  ")).toBe(
      "https://www.doordash.com/search/store/tacos/",
    );
  });

  test("ubereats geo rides along as a JSON pl param and round-trips", () => {
    const url = buildTakeoutSearchUrl("ubereats", "poke bowl", { lat: 40.7128, lng: -74.006 });
    const parsed = new URL(url);
    expect(parsed.searchParams.get("q")).toBe("poke bowl");
    expect(JSON.parse(parsed.searchParams.get("pl") ?? "")).toEqual({
      latitude: 40.7128,
      longitude: -74.006,
    });
  });

  test("no geo means no pl param", () => {
    const parsed = new URL(buildTakeoutSearchUrl("ubereats", "poke bowl"));
    expect(parsed.searchParams.has("pl")).toBe(false);
  });
});

describe("provider metadata", () => {
  test("both providers are offered with their homepage fallback", () => {
    expect(TAKEOUT_PROVIDERS.map((p) => p.id).sort()).toEqual(["doordash", "ubereats"]);
    for (const { id } of TAKEOUT_PROVIDERS) {
      const home = new URL(PROVIDER_HOMEPAGES[id]);
      expect(home.protocol).toBe("https:");
    }
  });
});
