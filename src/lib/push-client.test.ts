import { describe, it, expect, beforeAll } from "vitest";
import { urlBase64ToUint8Array } from "@/lib/push-client";

beforeAll(() => {
  // The conversion reads window.atob; Node has atob but no window.
  (globalThis as Record<string, unknown>).window = globalThis;
});

describe("urlBase64ToUint8Array", () => {
  it("decodes base64url bytes", () => {
    expect(Array.from(urlBase64ToUint8Array("AQID"))).toEqual([1, 2, 3]);
  });

  it("handles padding-less base64url strings", () => {
    expect(Array.from(urlBase64ToUint8Array("AQI"))).toEqual([1, 2]);
  });

  it("decodes a realistic VAPID-key-length string with - and _", () => {
    const bytes = urlBase64ToUint8Array(
      "BEl62iUYgUivxIkv69yViEuiBIa-Ib9-SkvMeAtA3LFgDzkQZOkFg07VNW-UhE4Bn6pQNQH0yHlDg7X8t_3A",
    );
    expect(bytes).toBeInstanceOf(Uint8Array);
    expect(bytes.length).toBeGreaterThan(50);
  });
});
