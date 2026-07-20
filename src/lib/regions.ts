export const MATCH_REGIONS = [
  "USA East",
  "USA Central",
  "USA Mountain",
  "USA Pacific",
  "Canada East",
  "Canada Central",
  "Canada Mountain",
  "Canada Pacific",
  "Mexico North",
  "Mexico Central",
  "Central America",
  "South America",
  "Europe West",
  "Europe East",
  "East Asia",
  "Southeast Asia",
  "Oceania",
  "Other",
] as const;

export type MatchRegion = (typeof MATCH_REGIONS)[number];

// Approximate representative coordinates per region, used only to rank
// closeness for default matching — not shown to players. "Other" has none
// (unknown location), so it only ever matches other "Other" players.
const REGION_COORDINATES: Record<string, [number, number]> = {
  "USA East": [38.9, -77.0],
  "USA Central": [41.9, -87.6],
  "USA Mountain": [39.7, -105.0],
  "USA Pacific": [34.0, -118.2],
  "Canada East": [43.7, -79.4],
  "Canada Central": [49.9, -97.1],
  "Canada Mountain": [51.0, -114.1],
  "Canada Pacific": [49.3, -123.1],
  "Mexico North": [25.7, -100.3],
  "Mexico Central": [19.4, -99.1],
  "Central America": [9.0, -79.5],
  "South America": [-23.5, -46.6],
  "Europe West": [48.9, 2.3],
  "Europe East": [52.2, 21.0],
  "East Asia": [35.7, 139.7],
  "Southeast Asia": [1.3, 103.8],
  "Oceania": [-33.9, 151.2],
};

// Great-circle distance between two regions' representative points, in km.
function distanceKm(a: [number, number], b: [number, number]) {
  const R = 6371;
  const [lat1, lon1] = a;
  const [lat2, lon2] = b;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const sinLat = Math.sin(dLat / 2);
  const sinLon = Math.sin(dLon / 2);
  const h =
    sinLat * sinLat +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * sinLon * sinLon;
  return R * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
}

// Self-declared match radius options. null means worldwide. Matching two
// players requires the actual distance between their regions to be within
// BOTH of their individually chosen radii — one side opting into a wider
// radius doesn't override the other side's narrower one, since a distance
// preference is about that player's own connection tolerance.
export const MATCH_DISTANCE_PRESETS = [
  { label: "Same region only", km: 0 },
  { label: "Nearby (~2,000 km)", km: 2000 },
  { label: "Regional (~5,000 km)", km: 5000 },
  { label: "Continental (~10,000 km)", km: 10000 },
  { label: "Worldwide", km: null },
] as const;

export const DEFAULT_MATCH_DISTANCE_KM = 5000;

// Includes the region itself, so callers can treat this as the whole set of
// regions worth matching against without a separate same-region check.
// maxKm of null means no limit (worldwide).
export function getRegionsWithinDistance(region: string | null, maxKm: number | null): string[] {
  if (!region) return [];
  const origin = REGION_COORDINATES[region];
  if (!origin) return [region]; // "Other" or anything without known coordinates
  if (maxKm === null) return [...MATCH_REGIONS];

  return MATCH_REGIONS.filter((candidate) => {
    if (candidate === region) return true;
    const point = REGION_COORDINATES[candidate];
    return point !== undefined && distanceKm(origin, point) <= maxKm;
  });
}
