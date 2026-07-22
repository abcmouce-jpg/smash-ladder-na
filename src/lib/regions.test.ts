import { describe, it, expect } from "vitest";
import { getRegionsWithinDistance, MATCH_REGIONS } from "./regions";

describe("getRegionsWithinDistance", () => {
  it("returns empty array for null region", () => {
    expect(getRegionsWithinDistance(null, 5000)).toEqual([]);
  });

  it("returns only the region itself for unknown regions like 'Other'", () => {
    expect(getRegionsWithinDistance("Other", 5000)).toEqual(["Other"]);
  });

  it("always includes the region itself", () => {
    expect(getRegionsWithinDistance("USA East", 0)).toContain("USA East");
  });

  it("returns only the same region at distance 0", () => {
    const result = getRegionsWithinDistance("USA East", 0);
    expect(result).toEqual(["USA East"]);
  });

  it("includes nearby regions within range", () => {
    const result = getRegionsWithinDistance("USA East", 2000);
    expect(result).toContain("USA East");
    expect(result).toContain("Canada East");
  });

  it("excludes distant regions from a tight radius", () => {
    const result = getRegionsWithinDistance("USA East", 2000);
    expect(result).not.toContain("East Asia");
    expect(result).not.toContain("Oceania");
  });

  it("returns all regions for null (worldwide) distance", () => {
    const result = getRegionsWithinDistance("USA East", null);
    expect(result).toEqual([...MATCH_REGIONS]);
  });

  it("USA Pacific and USA East are far enough apart to be excluded at 2000km", () => {
    const result = getRegionsWithinDistance("USA East", 2000);
    expect(result).not.toContain("USA Pacific");
  });

  it("continental distance covers all of NA", () => {
    const result = getRegionsWithinDistance("USA East", 10000);
    expect(result).toContain("USA Pacific");
    expect(result).toContain("Canada Pacific");
    expect(result).toContain("Mexico Central");
  });
});
