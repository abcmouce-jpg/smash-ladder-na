import { describe, it, expect, vi, afterEach } from "vitest";

// REGION_SET is read once at module load, so the Japanese catalog can only be
// exercised by re-importing the module under a stubbed env. The NA assertions
// live in regions.test.ts, which runs under the default (unset) env.
async function loadJapaneseInstance() {
  vi.resetModules();
  vi.stubEnv("NEXT_PUBLIC_REGION_SET", "jp");
  return import("./regions");
}

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("the Japanese instance's region catalog", () => {
  it("offers the 47 prefectures and nothing from North America", async () => {
    const { MATCH_REGIONS } = await loadJapaneseInstance();
    expect(MATCH_REGIONS).toContain("東京都");
    expect(MATCH_REGIONS).toContain("沖縄県");
    expect(MATCH_REGIONS).toContain("北海道");
    expect(MATCH_REGIONS).not.toContain("USA East");
    expect(MATCH_REGIONS).not.toContain("Texas");
    // 47 prefectures + 6 overseas buckets.
    expect(MATCH_REGIONS.length).toBe(53);
  });

  it("groups every region exactly once, same invariant as the NA picker", async () => {
    const { MATCH_REGIONS, MATCH_REGION_GROUPS } = await loadJapaneseInstance();
    const grouped = MATCH_REGION_GROUPS.flatMap((g) => g.regions);
    expect(grouped.length).toBe(MATCH_REGIONS.length);
    expect(new Set(grouped)).toEqual(new Set(MATCH_REGIONS));
  });

  it("gives every prefecture coordinates, so none of them is match-isolated", async () => {
    // A prefecture with no coordinates would fall through to the "unknown
    // location" branch and only ever match itself — silently unmatchable.
    // The 海外 buckets are a continent apart by definition and are excluded.
    const { MATCH_REGIONS, getRegionsWithinDistance } = await loadJapaneseInstance();
    const prefectures = MATCH_REGIONS.filter((r) => !r.startsWith("海外"));
    expect(prefectures).toHaveLength(47);
    const isolated = prefectures.filter((r) => getRegionsWithinDistance(r, 1200).length === 1);
    expect(isolated).toEqual([]);
  });

  it("keeps 海外（その他） matching only itself, like NA's \"Other\"", async () => {
    const { getRegionsWithinDistance } = await loadJapaneseInstance();
    expect(getRegionsWithinDistance("海外（その他）", 5000)).toEqual(["海外（その他）"]);
  });

  it("puts the 関東 prefectures within the tightest non-zero radius of 東京都", async () => {
    // 50km is the first step a Tokyo player can pick above "same prefecture",
    // and it has to actually reach the neighbouring scene to be worth offering.
    const { getRegionsWithinDistance } = await loadJapaneseInstance();
    const near = getRegionsWithinDistance("東京都", 50);
    expect(near).toContain("神奈川県");
    expect(near).toContain("埼玉県");
    expect(near).toContain("千葉県");
    expect(near).not.toContain("大阪府");
  });

  it("reaches 大阪府 from 東京都 at the default radius but not at 300km", async () => {
    const { getRegionsWithinDistance, DEFAULT_MATCH_DISTANCE_KM } = await loadJapaneseInstance();
    expect(getRegionsWithinDistance("東京都", 300)).not.toContain("大阪府");
    expect(getRegionsWithinDistance("東京都", DEFAULT_MATCH_DISTANCE_KM)).toContain("大阪府");
  });

  it("does not reach 沖縄県 from 東京都 even at the widest finite step", async () => {
    // ~1,550km apart — the only pairing the finite presets deliberately miss,
    // which is why 全国・海外 (null) exists.
    const { getRegionsWithinDistance } = await loadJapaneseInstance();
    expect(getRegionsWithinDistance("東京都", 1200)).not.toContain("沖縄県");
    expect(getRegionsWithinDistance("東京都", null)).toContain("沖縄県");
  });

  it("scopes the country filter to 日本/海外", async () => {
    const { MATCH_COUNTRIES, expandCountryForSearch } = await loadJapaneseInstance();
    expect([...MATCH_COUNTRIES]).toEqual(["日本", "海外"]);
    expect(expandCountryForSearch("日本")).toHaveLength(47);
    expect(expandCountryForSearch("日本")).toContain("東京都");
    expect(expandCountryForSearch("海外")).toContain("海外（北米）");
  });

  it("offers km-scaled distance presets, not the NA mileage ones", async () => {
    const { MATCH_DISTANCE_PRESETS, DEFAULT_MATCH_DISTANCE_KM } = await loadJapaneseInstance();
    expect(MATCH_DISTANCE_PRESETS.map((p) => p.km)).toEqual([0, 50, 150, 300, 600, 1200, null]);
    // setMaxMatchDistance validates against this list, so the default has to
    // be one of its values or every settings save fails.
    expect(MATCH_DISTANCE_PRESETS.some((p) => p.km === DEFAULT_MATCH_DISTANCE_KM)).toBe(true);
  });
});
