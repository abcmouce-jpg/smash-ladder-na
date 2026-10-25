import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { japaneseOgFonts } from "@/lib/og-fonts";

const CSS = 'src: url(https://fonts.gstatic.com/l/font?kit=abc) format("truetype");';

function mockFetch(impl: (url: string) => Response | Promise<Response>) {
  return vi
    .spyOn(globalThis, "fetch")
    .mockImplementation(((input: RequestInfo | URL) => Promise.resolve(impl(String(input)))) as typeof fetch);
}

function ok(body: string | ArrayBuffer) {
  return new Response(body, { status: 200 });
}

beforeEach(() => vi.restoreAllMocks());
afterEach(() => vi.restoreAllMocks());

describe("japaneseOgFonts", () => {
  it("doesn't go to the network for a name the bundled face can draw", async () => {
    const fetchSpy = mockFetch(() => ok(CSS));
    expect(await japaneseOgFonts("Mang0 | LIFETIME RECORD")).toBeUndefined();
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("asks for exactly the characters that need covering, deduped", async () => {
    const urls: string[] = [];
    mockFetch((url) => {
      urls.push(url);
      return url.includes("googleapis") ? ok(CSS) : ok(new ArrayBuffer(8));
    });

    await japaneseOgFonts("ほげ ほげ Player1");

    const cssUrl = urls.find((u) => u.includes("googleapis"))!;
    const text = decodeURIComponent(new URL(cssUrl).searchParams.get("text")!);
    // Only the non-Latin characters, each once.
    expect([...text].sort().join("")).toBe("げほ");
  });

  it("fetches both weights so one doesn't draw while the other boxes", async () => {
    const weights: string[] = [];
    mockFetch((url) => {
      if (url.includes("googleapis")) {
        weights.push(new URL(url).searchParams.get("family")!);
        return ok(CSS);
      }
      return ok(new ArrayBuffer(8));
    });

    const fonts = await japaneseOgFonts("さくら");

    expect(fonts?.map((f) => f.weight).sort()).toEqual([400, 700]);
    expect(weights).toHaveLength(2);
  });

  it("renders without the font rather than failing when Google is unreachable", async () => {
    mockFetch(() => {
      throw new Error("network down");
    });
    expect(await japaneseOgFonts("みどり")).toBeUndefined();
  });

  it("gives up on a partial result instead of drawing one weight", async () => {
    let calls = 0;
    mockFetch((url) => {
      if (!url.includes("googleapis")) return ok(new ArrayBuffer(8));
      calls += 1;
      return calls === 1 ? ok(CSS) : new Response("", { status: 500 });
    });
    expect(await japaneseOgFonts("ばしだ")).toBeUndefined();
  });

  it("reuses a glyph set it already fetched", async () => {
    const fetchSpy = mockFetch((url) => (url.includes("googleapis") ? ok(CSS) : ok(new ArrayBuffer(8))));

    await japaneseOgFonts("たなか");
    const afterFirst = fetchSpy.mock.calls.length;
    // Same characters, different order and a Latin tail — same subset.
    await japaneseOgFonts("かなた Player2");

    expect(fetchSpy.mock.calls.length).toBe(afterFirst);
  });
});
