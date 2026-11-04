import { describe, it, expect } from "vitest";
import { scriptLiteral } from "@/components/inline-script";

// Built rather than written literally: a raw U+2028 in this file would be the
// very thing under test sitting in the test's own source.
const LINE_SEP = String.fromCharCode(0x2028);
const PARA_SEP = String.fromCharCode(0x2029);

// What this has to survive is the HTML parser, not just the JS one: anything
// that can end the <script> element early turns an interpolated value into
// markup the browser runs.
describe("scriptLiteral", () => {
  it("escapes a closing script tag so it can't end the element", () => {
    const payload = "</script><img src=x onerror=alert(1)>";
    const out = scriptLiteral(payload);
    expect(out).not.toContain("</script");
    expect(out).toContain("\\u003c");
    // Still the same string once the JS parser is done with it.
    expect(JSON.parse(out.replace(/\\u003c/g, "<"))).toBe(payload);
  });

  it("escapes the quote and backslash that would break out of the literal", () => {
    expect(JSON.parse(scriptLiteral('a"b\\c'))).toBe('a"b\\c');
  });

  it("escapes the separators that end a line in JS but not in JSON", () => {
    const payload = `a${LINE_SEP}b${PARA_SEP}c`;
    const out = scriptLiteral(payload);
    expect(out).not.toContain(LINE_SEP);
    expect(out).not.toContain(PARA_SEP);
    expect(JSON.parse(out)).toBe(payload);
  });

  it("leaves an ordinary ISO timestamp readable", () => {
    expect(scriptLiteral("2026-10-25T07:00:00.000Z")).toBe('"2026-10-25T07:00:00.000Z"');
  });

  it("renders a missing value as null rather than undefined", () => {
    expect(scriptLiteral(undefined)).toBe("null");
    expect(scriptLiteral(null)).toBe("null");
  });
});
