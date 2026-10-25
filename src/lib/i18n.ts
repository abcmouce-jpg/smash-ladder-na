import { cookies } from "next/headers";
import { auth } from "@/auth";
import { setPreferredLanguage } from "@/lib/account";

// Lang and the string lookup live in lib/lang.ts, which stays free of the
// server-only imports above so client components can use them. Re-exported
// here because 65 files already import the type from this path.
import { asLang, type Lang } from "@/lib/lang";
import { DEFAULT_LANG } from "@/lib/site";

export type { Lang };

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

  return DEFAULT_LANG;
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
