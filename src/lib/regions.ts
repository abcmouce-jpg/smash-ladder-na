export const NA_REGIONS = [
  "USA East",
  "USA Central",
  "USA West",
  "Canada East",
  "Canada Central",
  "Canada West",
  "Mexico",
  "Central/South America",
  "Other",
] as const;

export type NaRegion = (typeof NA_REGIONS)[number];

// Geographic closeness, not just exact-region equality — pairs here are
// close enough (similar time zone / short travel distance) that matching
// across them still gives a reasonable connection. Anything not listed
// (e.g. USA East <-> USA West) needs crossRegionOk instead.
const NEARBY_REGION_PAIRS: readonly [string, string][] = [
  ["USA East", "Canada East"],
  ["USA East", "USA Central"],
  ["USA Central", "USA West"],
  ["USA Central", "Canada Central"],
  ["USA West", "Canada West"],
  ["Canada East", "Canada Central"],
  ["Canada Central", "Canada West"],
  ["USA West", "Mexico"],
  ["USA Central", "Mexico"],
  ["Mexico", "Central/South America"],
];

// Includes the region itself, so callers can treat "nearby" as the whole
// set of regions worth matching against without a separate same-region check.
export function getNearbyRegions(region: string | null): string[] {
  if (!region) return [];
  const nearby = new Set([region]);
  for (const [a, b] of NEARBY_REGION_PAIRS) {
    if (a === region) nearby.add(b);
    if (b === region) nearby.add(a);
  }
  return [...nearby];
}
