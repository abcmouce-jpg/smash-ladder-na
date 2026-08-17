import { prisma } from "@/lib/db";
import type { UserRole } from "@/generated/prisma/enums";
import { translateText } from "@/lib/translate";
import type { Lang } from "@/lib/i18n";

export async function listMatchComments(userId: string, matchId: string) {
  const match = await prisma.ratingMatch.findUnique({
    where: { id: matchId },
    select: { player1Id: true, player2Id: true },
  });
  if (!match) throw new Error("Match not found");
  if (match.player1Id !== userId && match.player2Id !== userId) {
    throw new Error("Not a participant in this match");
  }

  const [comments, viewer] = await Promise.all([
    prisma.matchComment.findMany({
      where: { matchId },
      orderBy: { createdAt: "asc" },
      include: {
        author: { select: { id: true, username: true, avatarUrl: true, role: true } },
        translations: true,
      },
    }),
    prisma.user.findUnique({ where: { id: userId }, select: { preferredLanguage: true } }),
  ]);

  // preferredLanguage is nullable — null means "never explicitly set", which
  // getLang() treats as English everywhere else, so match that default here.
  const viewerLang: Lang = viewer?.preferredLanguage === "es" ? "es" : "en";

  return Promise.all(comments.map((c) => attachTranslation(c, userId, viewerLang)));
}

type CommentWithAuthor = Awaited<ReturnType<typeof prisma.matchComment.findMany>>[number] & {
  author: { id: string; username: string; avatarUrl: string | null; role: UserRole };
  translations: { lang: string; body: string }[];
};

async function attachTranslation(comment: CommentWithAuthor, viewerId: string, viewerLang: Lang) {
  // Skip your own messages — you know what you wrote.
  if (comment.authorId === viewerId) return { ...comment, translatedBody: null as string | null };

  // Deliberately not gated on the author's own preferredLanguage setting —
  // that's just their site UI preference, not what language they actually
  // typed this message in (two Spanish-speaking players can easily both
  // have their site language left on the English default while chatting in
  // Spanish). translateText's prompt already returns the text unchanged
  // when it's already in viewerLang, and the UI only shows a "translated"
  // indicator when the result actually differs from the original — so
  // always attempting translation here is what makes both directions work,
  // at the cost of one extra no-op API call for same-language pairs.
  const cached = comment.translations.find((t) => t.lang === viewerLang);
  if (cached) return { ...comment, translatedBody: cached.body };

  try {
    const translated = await translateText(comment.body, viewerLang);
    // Best-effort cache write — a duplicate from a concurrent request just
    // hits the unique constraint, which is fine to ignore.
    await prisma.matchCommentTranslation
      .create({ data: { commentId: comment.id, lang: viewerLang, body: translated } })
      .catch(() => {});
    return { ...comment, translatedBody: translated };
  } catch {
    // Translation failures fall back to showing the original text.
    return { ...comment, translatedBody: null as string | null };
  }
}

export async function postMatchComment(userId: string, matchId: string, body: string) {
  const trimmed = body.trim().slice(0, 500);
  if (!trimmed) throw new Error("Comment can't be empty");

  const match = await prisma.ratingMatch.findUnique({
    where: { id: matchId },
    select: { player1Id: true, player2Id: true },
  });
  if (!match) throw new Error("Match not found");
  if (match.player1Id !== userId && match.player2Id !== userId) {
    throw new Error("Not a participant in this match");
  }

  await prisma.matchComment.create({ data: { matchId, authorId: userId, body: trimmed } });
}

const TYPING_TIMEOUT_MS = 4_000;

export async function isOpponentTyping(matchId: string, userId: string) {
  // Find the other participant in the match
  const match = await prisma.ratingMatch.findUnique({
    where: { id: matchId },
    select: { player1Id: true, player2Id: true },
  });
  if (!match) return false;

  const opponentId = match.player1Id === userId ? match.player2Id : match.player1Id;

  const status = await prisma.matchTypingStatus.findUnique({
    where: { matchId_userId: { matchId, userId: opponentId } },
  });

  if (!status) return false;
  return Date.now() - status.lastTypingAt.getTime() < TYPING_TIMEOUT_MS;
}

// Mod-only spectator path — unlike listMatchComments/postMatchComment, this
// doesn't require the caller to be a participant. Callers (server actions/
// pages) are responsible for the MOD/ADMIN role check.
export async function listMatchCommentsAsMod(matchId: string) {
  return prisma.matchComment.findMany({
    where: { matchId },
    orderBy: { createdAt: "asc" },
    include: { author: { select: { id: true, username: true, avatarUrl: true, role: true } } },
  });
}

export async function postMatchCommentAsMod(modUserId: string, matchId: string, body: string) {
  const trimmed = body.trim().slice(0, 500);
  if (!trimmed) throw new Error("Comment can't be empty");
  const match = await prisma.ratingMatch.findUnique({ where: { id: matchId }, select: { id: true } });
  if (!match) throw new Error("Match not found");
  await prisma.matchComment.create({
    data: { matchId, authorId: modUserId, body: `[Mod] ${trimmed}` },
  });
}
