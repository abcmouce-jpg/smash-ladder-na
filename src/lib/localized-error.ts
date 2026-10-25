import { type Lang, tr } from "@/lib/lang";

/**
 * An error whose message a player is meant to read, carrying every language's
 * wording rather than one.
 *
 * The problem this solves: validation lives in lib/ ("not your turn to
 * strike", "you already picked your character"), which has no idea who is
 * asking — it's reached from a server action, a route handler and a cron job
 * alike. So the message was thrown in English and shown verbatim, and Japan
 * went live with its own match flow answering in English.
 *
 * The error carries the Record<Lang, string> itself instead of a code into a
 * central table, for the reason tr() keeps its strings inline: with the text
 * at the throw site you read the rule and its wording together, and a missing
 * translation is a compile error either way.
 *
 * `message` stays the English wording, so logs, stack traces and the tests
 * that assert on .toThrow("…") all read as before.
 */
export class LocalizedError extends Error {
  readonly strings: Record<Lang, string>;

  constructor(strings: Record<Lang, string>) {
    super(strings.en);
    this.name = "LocalizedError";
    this.strings = strings;
  }
}

/** Shown in place of anything that wasn't thrown deliberately. */
export const GENERIC_ERROR: Record<Lang, string> = {
  en: "Something went wrong — try again.",
  es: "Algo salió mal — inténtalo de nuevo.",
  ja: "問題が発生しました。もう一度お試しください。",
};

/**
 * What to put in front of a player when an action failed. A deliberate
 * LocalizedError speaks for itself; anything else — a Prisma failure, a
 * TypeError — becomes GENERIC_ERROR rather than being echoed to the page,
 * which is both friendlier and keeps internals off the screen.
 */
export function errorMessage(err: unknown, lang: Lang): string {
  return err instanceof LocalizedError ? tr(lang, err.strings) : tr(lang, GENERIC_ERROR);
}
