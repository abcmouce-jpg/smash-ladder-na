import type { ReactNode } from "react";

// Small-caps section label with a short primary accent tick on the left and
// an optional right-aligned action — the site's shared "section header"
// treatment for pages that stack several content blocks.
export function SectionHeading({ label, action }: { label: string; action?: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <h2 className="flex items-center gap-2 text-xs font-semibold tracking-widest text-muted-foreground uppercase">
        <span aria-hidden className="h-3.5 w-1 rounded-full bg-primary" />
        {label}
      </h2>
      {action}
    </div>
  );
}
