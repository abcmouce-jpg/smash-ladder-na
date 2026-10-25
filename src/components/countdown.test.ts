import { describe, it, expect } from "vitest";

// The formatting rule the clock variant implements, kept honest without
// standing up a React tree (the component's job beyond this is the interval).
function clock(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

describe("the countdown's clock format", () => {
  it("reads a five-minute report window as a clock, not 296 seconds", () => {
    expect(clock(296)).toBe("4:56");
    expect(clock(300)).toBe("5:00");
  });

  it("pads the seconds so the width doesn't jump as it ticks", () => {
    expect(clock(69)).toBe("1:09");
    expect(clock(61)).toBe("1:01");
  });

  it("still shows a sub-minute countdown", () => {
    expect(clock(45)).toBe("0:45");
    expect(clock(5)).toBe("0:05");
    expect(clock(0)).toBe("0:00");
  });
});
