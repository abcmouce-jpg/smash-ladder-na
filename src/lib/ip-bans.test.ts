import { describe, it, expect } from "vitest";
import { extractClientIp } from "@/lib/ip-bans";

// The header a client can forge is x-forwarded-for: it is a list each hop
// appends to, so its leftmost entry is attacker-supplied. These pin that the
// forged entry is never what comes back — reading it let a banned player
// evade isIpBanned with one header, and let anyone write a chosen address
// into someone else's lastKnownIp.
describe("extractClientIp", () => {
  it("prefers x-real-ip, which a client can't append to", () => {
    expect(extractClientIp("1.2.3.4, 203.0.113.9", "203.0.113.9")).toBe("203.0.113.9");
  });

  it("takes the last x-forwarded-for hop, not the client-supplied first one", () => {
    expect(extractClientIp("1.2.3.4, 203.0.113.9")).toBe("203.0.113.9");
  });

  it("is unchanged when the edge replaced the header with a single address", () => {
    expect(extractClientIp("203.0.113.9")).toBe("203.0.113.9");
  });

  it("ignores a forged entry even when it is the only thing that looks real", () => {
    // What a spoofing attempt looks like: the attacker names a clean address,
    // Vercel appends the one it actually saw.
    expect(extractClientIp("8.8.8.8, 198.51.100.23")).toBe("198.51.100.23");
  });

  it("tolerates the padding and empty hops a proxy chain can leave behind", () => {
    expect(extractClientIp("  1.2.3.4 ,, 203.0.113.9 ,")).toBe("203.0.113.9");
    expect(extractClientIp(" , ")).toBeNull();
  });

  it("returns null off Vercel, so callers treat the IP as unknown", () => {
    expect(extractClientIp(null)).toBeNull();
    expect(extractClientIp(null, null)).toBeNull();
    expect(extractClientIp("")).toBeNull();
  });

  it("falls back to x-forwarded-for when x-real-ip is blank", () => {
    expect(extractClientIp("1.2.3.4, 203.0.113.9", "   ")).toBe("203.0.113.9");
  });
});
