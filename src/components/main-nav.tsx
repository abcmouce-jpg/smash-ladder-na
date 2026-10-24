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
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import type { Lang } from "@/lib/i18n";

type Role = "USER" | "MOD" | "ADMIN";

// Record<Lang, string> rather than loose en/es fields: a new language turns
// every missing label into a type error instead of silently rendering
// English. Kept short on purpose — the nav scrolls horizontally on a phone.
const PRIMARY_LINKS: readonly { href: string; label: Record<Lang, string>; Icon: LucideIcon }[] = [
  { href: "/lobby", label: { en: "Lobby", es: "Sala", ja: "ロビー" }, Icon: Swords },
  { href: "/live", label: { en: "Live", es: "En vivo", ja: "配信" }, Icon: Radio },
  { href: "/friendlies", label: { en: "Friendlies", es: "Amistosos", ja: "フリー対戦" }, Icon: Users },
  { href: "/leaderboard", label: { en: "Leaderboard", es: "Clasificación", ja: "ランキング" }, Icon: Trophy },
  { href: "/stats", label: { en: "Stats", es: "Estadísticas", ja: "統計" }, Icon: BarChart3 },
  { href: "/notes", label: { en: "Notes", es: "Notas", ja: "対策メモ" }, Icon: NotebookPen },
];

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
export function MainNav({ lang, role }: { lang: Lang; role?: Role }) {
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
      {PRIMARY_LINKS.map(({ href, label, Icon }) => (
        <Link key={href} href={href} prefetch={false} className={linkClass(isActive(href))}>
          <Icon className="size-3.5" />
          {label[lang]}
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
