"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  AlertTriangle,
  BarChart3,
  CalendarClock,
  Flag,
  Gauge,
  NotebookPen,
  Radio,
  Search,
  Shield,
  Swords,
  Trophy,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";

type Role = "USER" | "MOD" | "ADMIN";

const PRIMARY_LINKS = [
  { href: "/lobby", en: "Lobby", es: "Sala", Icon: Swords },
  { href: "/live", en: "Live", es: "En vivo", Icon: Radio },
  { href: "/board", en: "Board", es: "Tablón", Icon: Users },
  { href: "/leaderboard", en: "Leaderboard", es: "Clasificación", Icon: Trophy },
  { href: "/stats", en: "Stats", es: "Estadísticas", Icon: BarChart3 },
  { href: "/notes", en: "Notes", es: "Notas", Icon: NotebookPen },
] as const;

const STAFF_LINKS = [
  { href: "/admin", label: "Admin", Icon: Gauge },
  { href: "/admin/players", label: "Players", Icon: Search },
  { href: "/admin/disputes", label: "Disputes", Icon: Shield },
  { href: "/admin/reports", label: "Reports", Icon: Flag },
  { href: "/admin/watchlist", label: "Watchlist", Icon: AlertTriangle },
  { href: "/admin/seasons", label: "Seasons", Icon: CalendarClock },
] as const;

// Main site navigation. Needs to be a client component only to highlight the
// current page via usePathname; the header itself (auth, language) stays a
// server component.
export function MainNav({ lang, role }: { lang: "en" | "es"; role?: Role }) {
  const pathname = usePathname();
  const isStaff = role === "MOD" || role === "ADMIN";

  const isActive = (href: string) =>
    pathname === href || (href !== "/" && (pathname.startsWith(href + "/") || pathname.startsWith(href + "?")));

  const linkClass = (active: boolean) =>
    cn(
      "flex shrink-0 items-center gap-1.5 whitespace-nowrap transition-colors",
      active ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground",
    );

  return (
    <nav className="flex items-center gap-4 overflow-x-auto text-sm [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [&>*]:shrink-0">
      {PRIMARY_LINKS.map(({ href, en, es, Icon }) => (
        <Link key={href} href={href} prefetch={false} className={linkClass(isActive(href))}>
          <Icon className="size-3.5" />
          {lang === "es" ? es : en}
        </Link>
      ))}

      {isStaff && (
        <>
          <span aria-hidden className="h-4 w-px shrink-0 bg-border" />
          {STAFF_LINKS.map(({ href, label, Icon }) => (
            <Link key={href} href={href} prefetch={false} className={linkClass(isActive(href))}>
              <Icon className="size-3.5" />
              {label}
            </Link>
          ))}
        </>
      )}
    </nav>
  );
}
