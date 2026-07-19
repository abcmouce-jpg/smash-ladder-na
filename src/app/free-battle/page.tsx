import Image from "next/image";
import { Users } from "lucide-react";
import { auth } from "@/auth";
import { getOwnActivePost, getUserBrief, listOpenPosts } from "@/lib/free-battle";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { claimFreeBattlePost, closeFreeBattlePost, postFreeBattle } from "./actions";

export default async function FreeBattlePage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <PageTitle />
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with Discord (top right) to post or join a free battle.
        </p>
      </main>
    );
  }

  const userId = session.user.id;
  const [ownPost, openPosts] = await Promise.all([
    getOwnActivePost(userId),
    listOpenPosts(userId),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <PageTitle />
      <p className="mt-1 text-sm text-muted-foreground">
        Casual, unranked friendlies — post what you&apos;re looking for or join someone else&apos;s.
      </p>

      {ownPost ? <OwnPostCard post={ownPost} /> : <PostForm />}

      <div className="mt-10">
        <h2 className="text-sm font-medium text-muted-foreground">Open posts</h2>
        {openPosts.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">No open posts right now.</p>
        )}
        <ul className="mt-4 flex flex-col gap-3">
          {openPosts.map((post) => (
            <li key={post.id}>
              <Card>
                <CardContent className="flex items-start justify-between gap-4 pt-4">
                  <div className="flex items-start gap-3">
                    {post.author.avatarUrl && (
                      <Image
                        src={post.author.avatarUrl}
                        alt={post.author.username}
                        width={32}
                        height={32}
                        className="rounded-full"
                      />
                    )}
                    <div>
                      <p className="flex items-center gap-2 text-sm font-medium">
                        {post.author.username}
                        {post.region && <Badge variant="outline">{post.region}</Badge>}
                      </p>
                      <p className="mt-0.5 text-sm text-muted-foreground">{post.comment}</p>
                    </div>
                  </div>
                  <form action={claimFreeBattlePost.bind(null, post.id)}>
                    <Button type="submit" size="sm">
                      I&apos;m in
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function PageTitle() {
  return (
    <div className="flex items-center gap-2">
      <Users className="size-5 text-muted-foreground" />
      <h1 className="text-2xl font-semibold tracking-tight">Free Battle</h1>
    </div>
  );
}

function PostForm() {
  async function action(formData: FormData) {
    "use server";
    const comment = String(formData.get("comment") ?? "");
    await postFreeBattle(comment);
  }

  return (
    <Card className="mt-8">
      <CardContent className="pt-4">
        <form action={action} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            What are you looking for?
            <textarea
              name="comment"
              required
              rows={2}
              placeholder="e.g. Looking for friendlies, Fox/Falco, EST evenings"
              className="w-full resize-none rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring"
            />
          </label>
          <p className="text-xs text-muted-foreground">
            Region is pulled from your profile — set it on the Lobby page.
          </p>
          <Button type="submit" className="self-start">
            Post
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

async function OwnPostCard({
  post,
}: {
  post: NonNullable<Awaited<ReturnType<typeof getOwnActivePost>>>;
}) {
  if (post.status === "OPEN") {
    return (
      <Card className="mt-8">
        <CardContent className="pt-4">
          <p className="text-sm text-muted-foreground">
            Your post is live. Waiting for someone to join…
          </p>
          <form action={closeFreeBattlePost.bind(null, post.id)} className="mt-3">
            <Button type="submit" variant="outline" size="sm">
              Close post
            </Button>
          </form>
        </CardContent>
      </Card>
    );
  }

  const matchedWith = post.matchedWithId ? await getUserBrief(post.matchedWithId) : null;

  return (
    <Card className="mt-8">
      <CardContent className="pt-4">
        <Badge variant="success">Matched!</Badge>
        {matchedWith && (
          <div className="mt-3 flex items-center gap-3">
            {matchedWith.avatarUrl && (
              <Image
                src={matchedWith.avatarUrl}
                alt={matchedWith.username}
                width={32}
                height={32}
                className="rounded-full"
              />
            )}
            <p className="text-sm font-medium">{matchedWith.username}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
