import { describe, it, expect } from "vitest";
import { defaultRegionFromGeoHeaders } from "./geo-region";

describe("defaultRegionFromGeoHeaders", () => {
  it("maps a US state code to the matching state region", () => {
    expect(defaultRegionFromGeoHeaders("US", "CA")).toBe("California");
    expect(defaultRegionFromGeoHeaders("US", "ny")).toBe("New York");
  });

  it("maps a Canadian province code to the matching province region", () => {
    expect(defaultRegionFromGeoHeaders("CA", "ON")).toBe("Ontario");
  });

  it("maps DC to Washington D.C.", () => {
    expect(defaultRegionFromGeoHeaders("US", "DC")).toBe("Washington D.C.");
  });

  it("falls back to a coarse region for a mapped country with no state-level data", () => {
    expect(defaultRegionFromGeoHeaders("JP", null)).toBe("East Asia");
    expect(defaultRegionFromGeoHeaders("gb", null)).toBe("Europe West");
  });

  it("returns null for an unrecognized US state code", () => {
    expect(defaultRegionFromGeoHeaders("US", "ZZ")).toBeNull();
  });

  it("returns null for an unmapped country", () => {
    expect(defaultRegionFromGeoHeaders("XX", null)).toBeNull();
  });

  it("returns null when country is null", () => {
    expect(defaultRegionFromGeoHeaders(null, null)).toBeNull();
  });
});
