// USA/Canada broad regions predate state/province-level granularity below —
// kept in place rather than removed because ~680 of ~785 existing players
// already have one of these eight set, and removing them would silently
// strand those players' matchmaking (getRegionsWithinDistance can only ever
// return regions still in MATCH_REGIONS). New players get finer-grained
// options; nobody's existing setting breaks.
const USA_BROAD = ["USA East", "USA Central", "USA Mountain", "USA Pacific"] as const;
const CANADA_BROAD = ["Canada East", "Canada Central", "Canada Mountain", "Canada Pacific"] as const;

const USA_STATES = [
  "Alabama",
  "Alaska",
  "Arizona",
  "Arkansas",
  "California",
  "Colorado",
  "Connecticut",
  "Delaware",
  "Florida",
  "Georgia",
  "Hawaii",
  "Idaho",
  "Illinois",
  "Indiana",
  "Iowa",
  "Kansas",
  "Kentucky",
  "Louisiana",
  "Maine",
  "Maryland",
  "Massachusetts",
  "Michigan",
  "Minnesota",
  "Mississippi",
  "Missouri",
  "Montana",
  "Nebraska",
  "Nevada",
  "New Hampshire",
  "New Jersey",
  "New Mexico",
  "New York",
  "North Carolina",
  "North Dakota",
  "Ohio",
  "Oklahoma",
  "Oregon",
  "Pennsylvania",
  "Rhode Island",
  "South Carolina",
  "South Dakota",
  "Tennessee",
  "Texas",
  "Utah",
  "Vermont",
  "Virginia",
  "Washington",
  "West Virginia",
  "Wisconsin",
  "Wyoming",
  "Washington D.C.",
] as const;

const CANADA_PROVINCES = [
  "Ontario",
  "Quebec",
  "British Columbia",
  "Alberta",
  "Manitoba",
  "Saskatchewan",
  "Nova Scotia",
  "New Brunswick",
  "Newfoundland and Labrador",
  "Prince Edward Island",
  "Northwest Territories",
  "Yukon",
  "Nunavut",
] as const;

const REST_OF_WORLD = [
  "Mexico North",
  "Mexico Central",
  "Caribbean",
  "Central America",
  "South America",
  "Europe West",
  "Europe East",
  "East Asia",
  "Southeast Asia",
  "Oceania",
  "Other",
] as const;

export const MATCH_REGIONS = [
  ...USA_BROAD,
  ...USA_STATES,
  ...CANADA_BROAD,
  ...CANADA_PROVINCES,
  ...REST_OF_WORLD,
] as const;

export type MatchRegion = (typeof MATCH_REGIONS)[number];

// Drives the picker's <optgroup> sections — purely presentational grouping,
// doesn't affect matching (that's all distance math over REGION_COORDINATES
// below, which doesn't care which group a region is in).
export const MATCH_REGION_GROUPS: { label: string; regions: readonly MatchRegion[] }[] = [
  { label: "USA (broad)", regions: USA_BROAD },
  { label: "USA (state)", regions: USA_STATES },
  { label: "Canada (broad)", regions: CANADA_BROAD },
  { label: "Canada (province/territory)", regions: CANADA_PROVINCES },
  { label: "Elsewhere", regions: REST_OF_WORLD },
];

// One level coarser than region, for players who think "which country" long
// before they think "which state" — the leaderboard's country filter reads
// off this rather than making people pick a specific region just to narrow
// down that far. "Other" absorbs the rest of MATCH_REGIONS (Caribbean/Central
// America/South America/Europe/Asia/Oceania/"Other" itself) since none of
// those get individual-region granularity the way USA/Canada do; it isn't a
// "country" so much as "not USA, Canada, or Mexico."
export const MATCH_COUNTRIES = ["United States", "Canada", "Mexico", "Other"] as const;
export type MatchCountry = (typeof MATCH_COUNTRIES)[number];

const COUNTRY_TO_REGIONS: Record<MatchCountry, readonly string[]> = {
  "United States": [...USA_BROAD, ...USA_STATES],
  Canada: [...CANADA_BROAD, ...CANADA_PROVINCES],
  Mexico: ["Mexico North", "Mexico Central"],
  Other: REST_OF_WORLD.filter((r) => r !== "Mexico North" && r !== "Mexico Central"),
};

// Every MATCH_REGIONS value covered by a country — for filtering the
// leaderboard down to `region: { in: expandCountryForSearch(country) }`.
// Copied into a plain mutable array since Prisma's `in` filter wants
// string[], not the readonly array COUNTRY_TO_REGIONS holds.
export function expandCountryForSearch(country: MatchCountry): string[] {
  return [...COUNTRY_TO_REGIONS[country]];
}

// Approximate representative coordinates per region, used only to rank
// closeness for default matching — not shown to players. "Other" has none
// (unknown location), so it only ever matches other "Other" players. Where
// a state/province shares a metro area with one of the old broad regions
// above (e.g. California/"USA Pacific" both anchor on LA), the coordinates
// are deliberately identical — same physical point, just a more specific
// name for it.
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
  Caribbean: [18.2, -70.0],
  "Central America": [9.0, -79.5],
  "South America": [-23.5, -46.6],
  "Europe West": [48.9, 2.3],
  "Europe East": [52.2, 21.0],
  "East Asia": [35.7, 139.7],
  "Southeast Asia": [1.3, 103.8],
  "Oceania": [-33.9, 151.2],

  // USA states — anchored on each state's largest metro area.
  Alabama: [33.52, -86.8],
  Alaska: [61.22, -149.9],
  Arizona: [33.45, -112.07],
  Arkansas: [34.75, -92.29],
  California: [34.0, -118.2],
  Colorado: [39.7, -105.0],
  Connecticut: [41.19, -73.2],
  Delaware: [39.74, -75.55],
  Florida: [25.77, -80.19],
  Georgia: [33.75, -84.39],
  Hawaii: [21.31, -157.86],
  Idaho: [43.62, -116.2],
  Illinois: [41.9, -87.6],
  Indiana: [39.77, -86.16],
  Iowa: [41.6, -93.6],
  Kansas: [37.69, -97.34],
  Kentucky: [38.25, -85.76],
  Louisiana: [29.95, -90.07],
  Maine: [43.66, -70.26],
  Maryland: [39.29, -76.61],
  Massachusetts: [42.36, -71.06],
  Michigan: [42.33, -83.05],
  Minnesota: [44.98, -93.27],
  Mississippi: [32.3, -90.18],
  Missouri: [39.1, -94.58],
  Montana: [45.78, -108.5],
  Nebraska: [41.26, -95.94],
  Nevada: [36.17, -115.14],
  "New Hampshire": [42.99, -71.46],
  "New Jersey": [40.7, -74.17],
  "New Mexico": [35.08, -106.65],
  "New York": [40.71, -74.0],
  "North Carolina": [35.23, -80.84],
  "North Dakota": [46.88, -96.79],
  Ohio: [39.96, -83.0],
  Oklahoma: [35.47, -97.52],
  Oregon: [45.52, -122.68],
  Pennsylvania: [39.95, -75.17],
  "Rhode Island": [41.82, -71.41],
  "South Carolina": [32.78, -79.93],
  "South Dakota": [43.55, -96.73],
  Tennessee: [36.16, -86.78],
  Texas: [29.76, -95.37],
  Utah: [40.76, -111.89],
  Vermont: [44.48, -73.21],
  Virginia: [36.85, -76.0],
  Washington: [47.61, -122.33],
  "West Virginia": [38.35, -81.63],
  Wisconsin: [43.04, -87.91],
  Wyoming: [41.14, -104.82],
  "Washington D.C.": [38.9, -77.0],

  // Canada provinces/territories — anchored on each one's largest city.
  Ontario: [43.7, -79.4],
  Quebec: [45.5, -73.57],
  "British Columbia": [49.3, -123.1],
  Alberta: [51.0, -114.1],
  Manitoba: [49.9, -97.1],
  Saskatchewan: [52.13, -106.67],
  "Nova Scotia": [44.65, -63.57],
  "New Brunswick": [46.09, -64.79],
  "Newfoundland and Labrador": [47.56, -52.71],
  "Prince Edward Island": [46.24, -63.13],
  "Northwest Territories": [62.45, -114.37],
  Yukon: [60.72, -135.05],
  Nunavut: [63.75, -68.51],
};

// Reference city shown next to a region name in the picker so players can
// eyeball which option is physically closest to them instead of guessing
// from the name alone. Only needed for the broad/administrative labels
// (region names are not physical places there); state/province names are
// specific enough on their own.
export const REGION_REFERENCE_CITY: Partial<Record<MatchRegion, string>> = {
  "USA East": "Washington, D.C.",
  "USA Central": "Chicago",
  "USA Mountain": "Denver",
  "USA Pacific": "Los Angeles",
  "Canada East": "Toronto",
  "Canada Central": "Winnipeg",
  "Canada Mountain": "Calgary",
  "Canada Pacific": "Vancouver",
  "Mexico North": "Monterrey",
  "Mexico Central": "Mexico City",
  Caribbean: "San Juan",
  "Central America": "Panama City",
  "South America": "São Paulo",
  "Europe West": "Paris",
  "Europe East": "Warsaw",
  "East Asia": "Tokyo",
  "Southeast Asia": "Singapore",
  "Oceania": "Sydney",
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
//
// Labels are deliberately distance-first rather than named after a
// geographic unit (e.g. "Continental") — a fixed radius covers very
// different amounts of territory depending on where you are (5,000km is
// most of a large country in NA, but nearly all of Europe), so a label
// claiming to match a specific unit reads wrong for a lot of players.
//
// Displayed in miles since the target audience is NA — the underlying
// `km` values are what's actually stored and compared against, unchanged.
//
// WARNING: setMaxMatchDistance validates against this exact list, so any
// km value not in it gets rejected outright. Changing these values (adding,
// removing, or renumbering a step) orphans every user already storing an
// old value — every settings save then fails validation, on whichever
// field happens to be checked first, until that data is migrated. This bit
// us on 2026-08-03's rework (71% of users silently blocked from saving any
// lobby setting for two days) — see
// engineering/debug-log/2026-08-05-orphaned-match-distance-presets.md in
// the company notes. Any future change here MUST ship with a migration
// that snaps existing stored values to the nearest new preset.
//
// Reworked 2026-08-03 after player feedback that "Moderate" (formerly
// 3,200km) was wide enough to span Canada to Mexico, or the US west coast
// to the east coast — the mid tiers were too coarse to actually express
// "I want someone reasonably close." More steps under ~800mi now let
// players narrow that down; everything that used to be spread across
// Wide/Long-range/Very long-range (7,200–15,000km) collapses into one
// coarser top step instead, since that distinction rarely mattered in
// practice — past a few thousand miles, ping is bad either way.
export const MATCH_DISTANCE_PRESETS = [
  { label: "Same region only", km: 0 },
  { label: "Very close (~150 mi)", km: 240 },
  { label: "Close (~400 mi)", km: 640 },
  { label: "Nearby (~800 mi)", km: 1300 },
  { label: "Moderate (~1,500 mi)", km: 2400 },
  { label: "Extended (~3,500 mi)", km: 5600 },
  { label: "Worldwide", km: null },
] as const;

export const DEFAULT_MATCH_DISTANCE_KM = 2400;

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

// Which state/province falls under each legacy broad region, for the
// leaderboard's region search — searching "USA East" should also surface
// players who set a specific state (e.g. "New York") rather than only an
// exact string match against the broad label itself. Predominant time
// zone per state/province; a handful genuinely straddle two zones (Texas,
// Kansas, Nebraska, Tennessee, Kentucky, Ontario, etc.) and are grouped by
// whichever zone their capital/largest population center uses. Alaska,
// Hawaii, and Nunavut don't cleanly fit any of the four broad buckets, so
// they're only reachable by their own name.
const USA_BROAD_TO_STATES: Record<string, readonly string[]> = {
  "USA East": [
    "Connecticut",
    "Delaware",
    "Florida",
    "Georgia",
    "Indiana",
    "Kentucky",
    "Maine",
    "Maryland",
    "Massachusetts",
    "Michigan",
    "New Hampshire",
    "New Jersey",
    "New York",
    "North Carolina",
    "Ohio",
    "Pennsylvania",
    "Rhode Island",
    "South Carolina",
    "Vermont",
    "Virginia",
    "Washington D.C.",
    "West Virginia",
  ],
  "USA Central": [
    "Alabama",
    "Arkansas",
    "Illinois",
    "Iowa",
    "Kansas",
    "Louisiana",
    "Minnesota",
    "Mississippi",
    "Missouri",
    "Nebraska",
    "North Dakota",
    "Oklahoma",
    "South Dakota",
    "Tennessee",
    "Texas",
    "Wisconsin",
  ],
  "USA Mountain": ["Arizona", "Colorado", "Idaho", "Montana", "New Mexico", "Utah", "Wyoming"],
  "USA Pacific": ["California", "Nevada", "Oregon", "Washington"],
};

const CANADA_BROAD_TO_PROVINCES: Record<string, readonly string[]> = {
  "Canada East": [
    "Ontario",
    "Quebec",
    "New Brunswick",
    "Nova Scotia",
    "Prince Edward Island",
    "Newfoundland and Labrador",
  ],
  "Canada Central": ["Manitoba", "Saskatchewan"],
  "Canada Mountain": ["Alberta", "Northwest Territories"],
  "Canada Pacific": ["British Columbia", "Yukon"],
};

const BROAD_REGION_TO_SUBREGIONS: Record<string, readonly string[]> = {
  ...USA_BROAD_TO_STATES,
  ...CANADA_BROAD_TO_PROVINCES,
};

// Expands a broad region into itself plus every state/province grouped
// under it (see BROAD_REGION_TO_SUBREGIONS above); a specific state/
// province or "Elsewhere" region just returns itself unchanged.
export function expandRegionForSearch(region: string): string[] {
  const subregions = BROAD_REGION_TO_SUBREGIONS[region];
  return subregions ? [region, ...subregions] : [region];
}
