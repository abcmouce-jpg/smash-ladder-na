// Pure, no server dependencies — imported by both a server module
// (lib/account.ts, for validation and resolution) and a client component
// (quick-messages-form.tsx, for placeholders), so it can't drag prisma
// into the client bundle the way importing straight from account.ts would.

// Single source of truth for the un-customized quick-message buttons —
// also used by the match chat (comment-form.tsx) as its own default prop.
export const DEFAULT_QUICK_MESSAGES = ["Hey!", "glhf!", "gg!", "ggs!"];
export const MAX_QUICK_MESSAGE_LENGTH = 20;

// Merges a player's saved slots with the site defaults for display — a
// blank/missing slot falls back to that same position's default rather
// than collapsing the list, so a deliberately-blank slot 2 doesn't shift
// slot 3's content into its place.
export function resolveQuickMessages(saved: string[]): string[] {
  return DEFAULT_QUICK_MESSAGES.map((fallback, i) => saved[i]?.trim() || fallback);
}
