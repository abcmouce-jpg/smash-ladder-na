// Helper for the "prevent flash before hydration" pattern
// (https://nextjs.org/docs/app/guides/preventing-flash-before-hydration):
// server-rendered pages can't know the visitor's locale/timezone, so an
// inline script rewrites the placeholder text synchronously while the HTML
// parses, before the first paint. On the client the script is inert
// (text/plain) — soft navigations render the corrected value directly in
// the browser — and the type mismatch is what keeps React from warning
// about a `<script>` tag in the tree.
/**
 * A value embedded in the body of an InlineScript, as a JS literal.
 *
 * JSON.stringify escapes quotes and backslashes but leaves `<` alone, so a
 * string containing `</script>` would still end the element as the HTML parser
 * sees it, whatever the JS grammar thinks. Escaping `<` as \u003c closes that,
 * and U+2028/U+2029 are escaped because they terminate a line in JS source
 * while JSON leaves them raw.
 */
export function scriptLiteral(value: unknown): string {
  return JSON.stringify(value ?? null)
    .replace(/</g, "\\u003c")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");
}

export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
