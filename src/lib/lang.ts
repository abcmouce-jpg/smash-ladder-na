// The language union and the one helper that reads a string in it.
//
// Split out of lib/i18n.ts because that module reaches for next/headers and
// the auth session to work out *which* language a visitor gets — server-only
// machinery that a client component must not pull into its bundle. This file
// has no runtime imports, so a "use client" component can call tr() freely.

import type React from "react";

// "ja" added 2026-10-23: スマメイト is shutting down and the team is building a
// Japanese version on this same codebase.
export type Lang = "en" | "es" | "ja";

export const LANGS: readonly Lang[] = ["en", "es", "ja"] as const;

export function asLang(value: string | null | undefined): Lang | null {
  return LANGS.includes(value as Lang) ? (value as Lang) : null;
}

/**
 * Replaces the `lang === "es" ? "Sala" : "Lobby"` idiom this codebase was
 * built on. That form was fine for two languages and silently wrong at three:
 * every one of its 665 sites would have rendered English to a Japanese
 * visitor, with nothing to tell you which. Requiring the full Record<Lang,
 * string> turns each missing translation into a compile error instead, so the
 * next language is a known amount of work rather than an invisible one.
 *
 * The strings stay inline at the point of use rather than moving to a keyed
 * table — a table would be the right call if translators worked on the file
 * directly, but with the text in the code a key only adds a lookup to chase.
 */
export function tr(lang: Lang, strings: Record<Lang, string>): string {
  return strings[lang];
}

/**
 * tr() for JSX. Several strings in this UI wrap part of themselves in a link
 * or a <Countdown>, so they can't be plain strings — and splitting them into
 * fragments around the element only works while the languages share word
 * order, which English and Japanese don't. Branching on the whole node keeps
 * each language's sentence intact.
 *
 * All three nodes are built and two are discarded. They're element objects,
 * not rendered output, so that costs an allocation, not a render.
 */
export function trNode(lang: Lang, nodes: Record<Lang, React.ReactNode>): React.ReactNode {
  return nodes[lang];
}
