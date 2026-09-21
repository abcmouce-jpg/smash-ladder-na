import type { ReactNode } from "react";

// Shared small-caps accent heading for sub-sections inside a profile tab —
// the red tick + letterspaced uppercase label reads as a section divider
// without the visual weight of a second Card.
export function SectionHeading({ children }: { children: ReactNode }) {
  return (
    <h2 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">
      <span aria-hidden className="h-3.5 w-1 rounded-full bg-primary" />
      {children}
    </h2>
  );
}
