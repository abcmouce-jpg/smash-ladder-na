import type { ComponentType } from "react";
import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";

// Compact "big number + label" tile for headline counts. Shared by the admin
// overview and the Stats overview so the two stat grids stay visually
// identical instead of drifting into two near-copies.
export function StatCard({
  icon: Icon,
  label,
  value,
  href,
  tone,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  value: number;
  /** When set, the whole card links here (with a hover affordance). */
  href?: string;
  tone?: "warning" | "destructive";
}) {
  const inner = (
    <CardContent className="flex items-center gap-3 py-4">
      <Icon
        className={`size-5 ${
          tone === "destructive"
            ? "text-destructive"
            : tone === "warning"
              ? "text-amber-600 dark:text-amber-400"
              : "text-muted-foreground"
        }`}
      />
      <div>
        <p className="text-xl font-semibold tabular-nums leading-none">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </div>
    </CardContent>
  );

  return (
    <Card className="py-0">
      {href ? (
        <Link href={href} className="block hover:bg-accent/50">
          {inner}
        </Link>
      ) : (
        inner
      )}
    </Card>
  );
}
