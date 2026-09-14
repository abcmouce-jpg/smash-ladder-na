import Link from "next/link";
import { cn } from "@/lib/utils";

// In-page tab strip (profile sections, Stats sub-views, …). Rendered as
// plain links with a shared scrollable underline so the current view is
// obvious and each tab stays deep-linkable / server-renderable — no client
// state required.
export function SectionTabs({
  items,
  className,
}: {
  items: { href: string; label: string; active?: boolean }[];
  className?: string;
}) {
  return (
    <nav
      aria-label="Sections"
      className={cn(
        "-mb-px flex items-center gap-5 overflow-x-auto border-b border-border text-sm",
        "[-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0",
        className,
      )}
    >
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          prefetch={false}
          aria-current={item.active ? "page" : undefined}
          className={cn(
            "-mb-px border-b-2 pb-2 transition-colors",
            item.active
              ? "border-primary font-medium text-foreground"
              : "border-transparent text-muted-foreground hover:border-muted-foreground/30 hover:text-foreground",
          )}
        >
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
