// Helper for the "prevent flash before hydration" pattern
// (https://nextjs.org/docs/app/guides/preventing-flash-before-hydration):
// server-rendered pages can't know the visitor's locale/timezone, so an
// inline script rewrites the placeholder text synchronously while the HTML
// parses, before the first paint. On the client the script is inert
// (text/plain) — soft navigations render the corrected value directly in
// the browser — and the type mismatch is what keeps React from warning
// about a `<script>` tag in the tree.
export function InlineScript({ html }: { html: string }) {
  return (
    <script
      type={typeof window === "undefined" ? "text/javascript" : "text/plain"}
      suppressHydrationWarning
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}
