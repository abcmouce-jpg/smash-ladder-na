"use client";

import { useId } from "react";
import { InlineScript } from "@/components/inline-script";

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
      <InlineScript
        html={`{var n=document.getElementById("${id}");if(n)n.textContent=new Date("${iso}").toLocaleString(undefined,{dateStyle:"medium",timeStyle:"short"})}`}
      />
    </>
  );
}
