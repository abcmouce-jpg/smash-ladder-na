import { describe, it, expect } from "vitest";
import { computeTierChange } from "./rank-roles";

describe("computeTierChange", () => {
  it("detects a tier change across a match", () => {
    const change = computeTierChange("u1", "d1", "Player", 1740, 1760, 20);
    expect(change.oldTier).toBe("Elite");
    expect(change.newTier).toBe("Master");
  });

  it("reports no change when staying in the same tier", () => {
    const change = computeTierChange("u1", "d1", "Player", 1500, 1550, 20);
    expect(change.oldTier).toBe("Fighter");
    expect(change.newTier).toBe("Fighter");
  });

  it("reports a tier drop the same way as a tier up — the caller decides what to do with direction", () => {
    const change = computeTierChange("u1", "d1", "Player", 1760, 1740, 20);
    expect(change.oldTier).toBe("Master");
    expect(change.newTier).toBe("Elite");
  });

  it("uses the pre-increment games count for oldTier so a provisional reveal is detected", () => {
    // 9 games before this match (still provisional) -> 10 after (tiered for the first time).
    const change = computeTierChange("u1", "d1", "Player", 1550, 1560, 9);
    expect(change.oldTier).toBeNull();
    expect(change.newTier).toBe("Fighter");
  });

  it("stays provisional on both sides when still under the games threshold after this match", () => {
    const change = computeTierChange("u1", "d1", "Player", 1550, 1600, 5);
    expect(change.oldTier).toBeNull();
    expect(change.newTier).toBeNull();
  });
});
