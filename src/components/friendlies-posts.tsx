import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { MapPin } from "lucide-react";
import type { FriendliesPost } from "@/lib/home-feed";
import type { Lang } from "@/lib/i18n";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { LocalTime } from "@/components/local-time";
import { RatingHidden } from "@/components/rating-hidden";
import { formatRating } from "@/lib/rating-format";
import { isRatingVisible } from "@/lib/rank-tier";

// Shared "who's looking for a game" card. The home page's Friendlies section
// and the Friendlies page itself render the same list, so an open post looks
// identical wherever a player runs into it. The home page passes an
// empty-state action linking here; on the Friendlies page the post form sits
// directly above the list, so there's nowhere to link and it's omitted.
export function FriendliesPosts({
  posts,
  lang,
  emptyAction,
}: {
  posts: FriendliesPost[];
  lang: Lang;
  emptyAction?: ReactNode;
}) {
  if (posts.length === 0) {
    return (
      <Card className="mt-3">
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            {lang === "es"
              ? "Nadie está buscando partida ahora mismo — sé el primero en publicar."
              : "No one's looking for a game right now — be the first to post."}
          </p>
          {emptyAction}
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="mt-3 divide-y divide-border overflow-hidden py-0">
      {posts.map((post) => (
        <div key={post.id} className="px-4 py-3">
          <div className="flex items-center gap-2.5">
            {post.author.avatarUrl && (
              <Image
                src={post.author.avatarUrl}
                alt={post.author.username}
                width={20}
                height={20}
                className="shrink-0 rounded-full"
              />
            )}
            <Link
              href={`/players/${post.author.id}`}
              className="min-w-0 flex-1 truncate text-sm font-medium hover:underline"
            >
              {post.author.username}
            </Link>
            <span className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
              <span>
                {isRatingVisible(post.author.gamesPlayed, false) ? (
                  formatRating(post.author.rating)
                ) : (
                  <RatingHidden gamesPlayed={post.author.gamesPlayed} lang={lang} />
                )}
              </span>
              <span aria-hidden>·</span>
              <LocalTime iso={post.createdAt.toISOString()} />
            </span>
          </div>
          <p className="mt-1 text-sm leading-snug">{post.comment}</p>
          {(post.region || post.minTier) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              {post.region && (
                <Badge variant="outline">
                  <MapPin className="size-3" />
                  {post.region}
                </Badge>
              )}
              {post.minTier && <Badge variant="outline">{post.minTier}+</Badge>}
            </div>
          )}
        </div>
      ))}
    </Card>
  );
}
