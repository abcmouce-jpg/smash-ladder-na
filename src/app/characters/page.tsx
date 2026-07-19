import Link from "next/link";
import { Swords } from "lucide-react";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { SMASH_CHARACTERS } from "@/lib/characters";
import { getCharacterVoteResults, getMyCharacterVote } from "@/lib/character-stats";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { updateMainCharacter, voteForCharacter } from "./actions";

export default async function CharactersPage() {
  const session = await auth();
  const userId = session?.user?.id;

  const [results, myVote, me] = await Promise.all([
    getCharacterVoteResults(),
    userId ? getMyCharacterVote(userId) : Promise.resolve(null),
    userId
      ? prisma.user.findUnique({ where: { id: userId }, select: { mainCharacter: true } })
      : Promise.resolve(null),
  ]);

  const topVotes = results.slice(0, 15);
  const maxVotes = topVotes[0]?.votes ?? 0;

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Swords className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Characters</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Vote for your favorite, and set your main to show up on its leaderboard.
      </p>

      {userId && (
        <Card className="mt-8">
          <CardContent className="flex flex-col gap-4 pt-4 sm:flex-row sm:items-end sm:justify-between">
            <CharacterForm
              label="Your main"
              hint="Filters you into that character's leaderboard."
              action={updateMainCharacter}
              current={me?.mainCharacter ?? ""}
              allowClear
            />
            <CharacterForm
              label="Your vote"
              hint="A lightweight popularity poll — vote for any character."
              action={voteForCharacter}
              current={myVote ?? ""}
            />
          </CardContent>
        </Card>
      )}

      <div className="mt-10">
        <h2 className="text-sm font-medium text-muted-foreground">Community favorites</h2>
        {topVotes.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">No votes yet — be the first.</p>
        )}
        <div className="mt-4 flex flex-col gap-2">
          {topVotes.map((r) => (
            <Link
              key={r.character}
              href={`/leaderboard?character=${encodeURIComponent(r.character)}`}
              className="block"
            >
              <div className="flex items-center gap-3 text-sm">
                <span className="w-32 shrink-0 truncate">{r.character}</span>
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                  <div
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${maxVotes === 0 ? 0 : (r.votes / maxVotes) * 100}%` }}
                  />
                </div>
                <Badge variant="outline" className="tabular-nums">
                  {r.votes}
                </Badge>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

function CharacterForm({
  label,
  hint,
  action,
  current,
  allowClear,
}: {
  label: string;
  hint: string;
  action: (character: string) => Promise<void>;
  current: string;
  allowClear?: boolean;
}) {
  async function formAction(formData: FormData) {
    "use server";
    await action(String(formData.get("character") ?? ""));
  }

  return (
    <form action={formAction} className="flex flex-1 flex-col gap-1.5">
      <label className="text-sm font-medium">
        {label}
        <p className="mt-0.5 text-xs font-normal text-muted-foreground">{hint}</p>
      </label>
      <div className="flex gap-2">
        <select
          name="character"
          defaultValue={current}
          className="h-8 flex-1 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        >
          {allowClear && <option value="">None</option>}
          {SMASH_CHARACTERS.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <Button type="submit" size="sm">
          Save
        </Button>
      </div>
    </form>
  );
}
