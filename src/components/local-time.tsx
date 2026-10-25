"use client";

import { useId } from "react";
import { InlineScript, scriptLiteral } from "@/components/inline-script";

// Server-rendered pages don't know the visitor's timezone, so the span
// carries a placeholder formatted in the server's timezone (UTC). An inline
// script rewrites it to the viewer's actual timezone synchronously while the
// HTML parses — before the first paint — and suppressHydrationWarning lets
// that corrected text pass through hydration untouched. On soft navigations
// the script is inert (type="text/plain") and formatting happens directly in
// the browser. Same pattern as the "prevent flash before hydration" guide:
// https://nextjs.org/docs/app/guides/preventing-flash-before-hydration
export function LocalTime({ iso }: { iso: string }) {
  const id = useId();
  return (
    <>
      <span id={id} suppressHydrationWarning>
        {new Date(iso).toLocaleString(undefined, { dateStyle: "medium", timeStyle: "short" })}
      </span>
      {/* Both values go through scriptLiteral rather than straight into the
          template. Every caller passes Date.prototype.toISOString() output, so
          nothing can break out of the string literal today — but this is script
          context, where the cost of being wrong once is stored XSS, and the
          component's signature is a bare `iso: string` that invites a caller
          to hand it something a player typed. */}
      <InlineScript
        html={`{var n=document.getElementById(${scriptLiteral(id)});if(n)n.textContent=new Date(${scriptLiteral(
          iso,
        )}).toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})}`}
      />
    </>
  );
}
