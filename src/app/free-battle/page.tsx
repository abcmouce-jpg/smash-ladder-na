import Image from "next/image";
import { auth } from "@/auth";
import { getOwnActivePost, getUserBrief, listOpenPosts } from "@/lib/free-battle";
import { Button } from "@/components/ui/button";
import { claimFreeBattlePost, closeFreeBattlePost, postFreeBattle } from "./actions";

export default async function FreeBattlePage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Free Battle</h1>
        <p className="mt-2 text-sm text-zinc-500">
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
      <h1 className="text-2xl font-semibold tracking-tight">Free Battle</h1>
      <p className="mt-1 text-sm text-zinc-500">
        Casual, unranked friendlies — post what you&apos;re looking for or join someone else&apos;s.
      </p>

      {ownPost ? <OwnPostCard post={ownPost} /> : <PostForm />}

      <div className="mt-10">
        <h2 className="text-sm font-medium text-zinc-500">Open posts</h2>
        {openPosts.length === 0 && (
          <p className="mt-4 text-sm text-zinc-500">No open posts right now.</p>
        )}
        <ul className="mt-4 flex flex-col gap-3">
          {openPosts.map((post) => (
            <li
              key={post.id}
              className="flex items-start justify-between gap-4 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800"
            >
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
                  <p className="text-sm font-medium">
                    {post.author.username}
                    {post.region && (
                      <span className="ml-2 text-xs text-zinc-500">{post.region}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-sm text-zinc-600 dark:text-zinc-400">{post.comment}</p>
                </div>
              </div>
              <form action={claimFreeBattlePost.bind(null, post.id)}>
                <Button type="submit" size="sm">
                  I&apos;m in
                </Button>
              </form>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

function PostForm() {
  async function action(formData: FormData) {
    "use server";
    const comment = String(formData.get("comment") ?? "");
    const region = String(formData.get("region") ?? "");
    await postFreeBattle(comment, region);
  }

  return (
    <form action={action} className="mt-8 flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        What are you looking for?
        <textarea
          name="comment"
          required
          rows={2}
          placeholder="e.g. Looking for friendlies, Fox/Falco, EST evenings"
          className="w-full resize-none rounded-lg border border-zinc-300 bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-zinc-500 dark:border-zinc-700"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Region (optional)
        <input
          name="region"
          placeholder="e.g. East Coast"
          className="h-8 w-48 rounded-lg border border-zinc-300 bg-transparent px-2.5 text-sm outline-none focus-visible:border-zinc-500 dark:border-zinc-700"
        />
      </label>
      <Button type="submit" className="self-start">
        Post
      </Button>
    </form>
  );
}

async function OwnPostCard({
  post,
}: {
  post: NonNullable<Awaited<ReturnType<typeof getOwnActivePost>>>;
}) {
  if (post.status === "OPEN") {
    return (
      <div className="mt-8 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
        <p className="text-sm text-zinc-500">Your post is live. Waiting for someone to join…</p>
        <form action={closeFreeBattlePost.bind(null, post.id)} className="mt-3">
          <Button type="submit" variant="outline" size="sm">
            Close post
          </Button>
        </form>
      </div>
    );
  }

  const matchedWith = post.matchedWithId ? await getUserBrief(post.matchedWithId) : null;

  return (
    <div className="mt-8 rounded-lg border border-zinc-200 p-4 dark:border-zinc-800">
      <p className="text-sm text-zinc-500">Matched!</p>
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
    </div>
  );
}
