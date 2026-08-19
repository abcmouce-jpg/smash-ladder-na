import type { MatchRegion } from "@/lib/regions";

// Vercel's edge network geolocates every request and forwards the result as
// plain headers — x-vercel-ip-country (ISO 3166-1 alpha-2) and
// x-vercel-ip-country-region (ISO 3166-2 subdivision code, no country
// prefix, e.g. "CA" for California, "ON" for Ontario). Next.js 15 removed
// the old request.geo/request.ip helpers in favor of reading these directly
// (see AGENTS.md) — same pattern extractClientIp already uses for
// x-forwarded-for. Absent entirely outside Vercel (e.g. local dev), which
// is fine: callers treat a null result as "couldn't guess."
const US_STATE_CODES: Record<string, MatchRegion> = {
  AL: "Alabama",
  AK: "Alaska",
  AZ: "Arizona",
  AR: "Arkansas",
  CA: "California",
  CO: "Colorado",
  CT: "Connecticut",
  DE: "Delaware",
  FL: "Florida",
  GA: "Georgia",
  HI: "Hawaii",
  ID: "Idaho",
  IL: "Illinois",
  IN: "Indiana",
  IA: "Iowa",
  KS: "Kansas",
  KY: "Kentucky",
  LA: "Louisiana",
  ME: "Maine",
  MD: "Maryland",
  MA: "Massachusetts",
  MI: "Michigan",
  MN: "Minnesota",
  MS: "Mississippi",
  MO: "Missouri",
  MT: "Montana",
  NE: "Nebraska",
  NV: "Nevada",
  NH: "New Hampshire",
  NJ: "New Jersey",
  NM: "New Mexico",
  NY: "New York",
  NC: "North Carolina",
  ND: "North Dakota",
  OH: "Ohio",
  OK: "Oklahoma",
  OR: "Oregon",
  PA: "Pennsylvania",
  RI: "Rhode Island",
  SC: "South Carolina",
  SD: "South Dakota",
  TN: "Tennessee",
  TX: "Texas",
  UT: "Utah",
  VT: "Vermont",
  VA: "Virginia",
  WA: "Washington",
  WV: "West Virginia",
  WI: "Wisconsin",
  WY: "Wyoming",
  DC: "Washington D.C.",
};

const CANADA_PROVINCE_CODES: Record<string, MatchRegion> = {
  ON: "Ontario",
  QC: "Quebec",
  BC: "British Columbia",
  AB: "Alberta",
  MB: "Manitoba",
  SK: "Saskatchewan",
  NS: "Nova Scotia",
  NB: "New Brunswick",
  NL: "Newfoundland and Labrador",
  PE: "Prince Edward Island",
  NT: "Northwest Territories",
  YT: "Yukon",
  NU: "Nunavut",
};

// Coarse fallback for countries we don't have state/province-level regions
// for — good enough to unblock queueing immediately; a player who cares
// about precision can always refine it themselves in Lobby settings. Not
// exhaustive — anything missing here just leaves region unset, same as
// today, and the account falls back to the setup banner.
const COUNTRY_FALLBACK: Record<string, MatchRegion> = {
  MX: "Mexico North",
  GB: "Europe West",
  IE: "Europe West",
  FR: "Europe West",
  DE: "Europe West",
  NL: "Europe West",
  BE: "Europe West",
  ES: "Europe West",
  IT: "Europe West",
  PT: "Europe West",
  CH: "Europe West",
  AT: "Europe West",
  SE: "Europe West",
  NO: "Europe West",
  DK: "Europe West",
  FI: "Europe West",
  PL: "Europe East",
  RO: "Europe East",
  UA: "Europe East",
  CZ: "Europe East",
  HU: "Europe East",
  GR: "Europe East",
  BG: "Europe East",
  RU: "Europe East",
  JP: "East Asia",
  KR: "East Asia",
  CN: "East Asia",
  TW: "East Asia",
  HK: "East Asia",
  SG: "Southeast Asia",
  TH: "Southeast Asia",
  PH: "Southeast Asia",
  ID: "Southeast Asia",
  VN: "Southeast Asia",
  MY: "Southeast Asia",
  AU: "Oceania",
  NZ: "Oceania",
  BR: "South America",
  AR: "South America",
  CL: "South America",
  CO: "South America",
  PE: "South America",
};

// Best-effort region guess from Vercel's geolocation headers — used only to
// pre-fill a brand-new account's region so joining the queue doesn't
// silently require a manual settings trip first (see region-setup-banner.tsx
// for the numbers on how many new sign-ups never came back to set this).
// Always overridable in Lobby settings; callers must never use this to
// overwrite a region a player already set themselves.
export function defaultRegionFromGeoHeaders(country: string | null, countryRegion: string | null): MatchRegion | null {
  if (country === "US" && countryRegion) {
    const state = US_STATE_CODES[countryRegion.toUpperCase()];
    if (state) return state;
  }
  if (country === "CA" && countryRegion) {
    const province = CANADA_PROVINCE_CODES[countryRegion.toUpperCase()];
    if (province) return province;
  }
  if (country) {
    const fallback = COUNTRY_FALLBACK[country.toUpperCase()];
    if (fallback) return fallback;
  }
  return null;
}
