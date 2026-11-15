// Human date range for a ladder week, in the reader's language.
//
// Its own module rather than a helper inside the report page because the
// index, the detail page and both of their <title>s all have to name the same
// week the same way — a list that says "Nov 9–15" linking to a page headed
// "November 9 to November 15" reads like two different weeks.
import { LADDER_TIME_ZONE } from "@/lib/timezone";
import type { Lang } from "@/lib/i18n";

const LOCALES: Record<Lang, string> = { en: "en-US", es: "es-MX" };

export function weekLabel(start: Date, end: Date, lang: Lang): string {
  const locale = LOCALES[lang];
  // `end` is the exclusive Monday; the week's last day is the Sunday before it.
  const last = new Date(end.getTime() - 12 * 60 * 60 * 1000);
  const range = new Intl.DateTimeFormat(locale, {
    timeZone: LADDER_TIME_ZONE,
    month: "long",
    day: "numeric",
  }).formatRange(start, last);
  const year = new Intl.DateTimeFormat(locale, { timeZone: LADDER_TIME_ZONE, year: "numeric" }).format(start);
  return `${range}, ${year}`;
}

/** Short form for a list row: "Nov 9–15". */
export function weekLabelShort(start: Date, end: Date, lang: Lang): string {
  const last = new Date(end.getTime() - 12 * 60 * 60 * 1000);
  return new Intl.DateTimeFormat(LOCALES[lang], {
    timeZone: LADDER_TIME_ZONE,
    month: "short",
    day: "numeric",
  }).formatRange(start, last);
}

/** Weekday + day for the per-day table: "Mon 9". */
export function dayLabel(dayKey: string, lang: Lang): string {
  const [y, m, d] = dayKey.split("-").map(Number);
  const noon = new Date(Date.UTC(y, m - 1, d, 12));
  return new Intl.DateTimeFormat(LOCALES[lang], { timeZone: "UTC", weekday: "short", day: "numeric" }).format(noon);
}
