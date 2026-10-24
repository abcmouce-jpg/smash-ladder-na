import { cookies } from "next/headers";
import { auth } from "@/auth";
import { setPreferredLanguage } from "@/lib/account";

// "ja" added 2026-10-23: スマメイト is shutting down and the team is building a
// Japanese version on this same codebase. Keep this union as the single source
// of truth — Record<Lang, string> in lib/messages.ts turns a missing
// translation into a type error.
export type Lang = "en" | "es" | "ja";

const LANGS: readonly Lang[] = ["en", "es", "ja"] as const;

function asLang(value: string | null | undefined): Lang | null {
  return LANGS.includes(value as Lang) ? (value as Lang) : null;
}

const LANG_COOKIE = "lang";

// Resolution order: explicit cookie (works for signed-out visitors too) →
// signed-in user's stored preference → English default. The cookie exists
// so the switcher in the header works everywhere without requiring an
// account, while still staying in sync with Settings for signed-in users
// (see setLangAction below).
export async function getLang(): Promise<Lang> {
  const cookieLang = asLang((await cookies()).get(LANG_COOKIE)?.value);
  if (cookieLang) return cookieLang;

  const session = await auth();
  if (session?.user?.id) {
    const { prisma } = await import("@/lib/db");
    const user = await prisma.user.findUnique({
      where: { id: session.user.id },
      select: { preferredLanguage: true },
    });
    const stored = asLang(user?.preferredLanguage);
    if (stored) return stored;
  }

  return "en";
}

// Shared server action for the header's language toggle. Sets the cookie so
// the change is visible immediately on every page (no redirect needed —
// Next.js re-renders the current route's Server Components after a Server
// Action runs), and mirrors it to the DB for signed-in users so Settings
// stays in sync with whatever was last picked from the header.
export async function setLangAction(lang: Lang) {
  "use server";
  (await cookies()).set(LANG_COOKIE, lang, {
    maxAge: 60 * 60 * 24 * 365,
    path: "/",
    sameSite: "lax",
  });

  const session = await auth();
  // null means "English", the default, so the column stays empty for the
  // majority rather than storing "en" on every row.
  if (session?.user?.id) await setPreferredLanguage(session.user.id, lang === "en" ? null : lang);
}
