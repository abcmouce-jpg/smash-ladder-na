import Link from "next/link";
import { redirect } from "next/navigation";
import { Trophy } from "lucide-react";
import { auth } from "@/auth";
import { listTournaments } from "@/lib/tournaments";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { createTournamentAction } from "./actions";

const STATUS_VARIANT = {
  SIGNUPS: "outline",
  IN_PROGRESS: "secondary",
  COMPLETED: "success",
  CANCELLED: "destructive",
} as const;

export default async function TournamentsPage() {
  const session = await auth();
  const tournaments = await listTournaments();

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Trophy className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Tournaments</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Casual, unrated community events — double elimination on start.gg by convention.
      </p>

      {session?.user?.id && (
        <Card className="mt-8">
          <CardContent className="pt-4">
            <CreateTournamentForm />
          </CardContent>
        </Card>
      )}

      <div className="mt-10 flex flex-col gap-3">
        {tournaments.map((t) => (
          <Link key={t.id} href={`/tournaments/${t.id}`}>
            <Card className="transition-colors hover:border-foreground/30">
              <CardContent className="flex items-center justify-between pt-4">
                <div>
                  <p className="text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Hosted by {t.host.username} · {t._count.entries} entrant
                    {t._count.entries === 1 ? "" : "s"}
                  </p>
                </div>
                <Badge variant={STATUS_VARIANT[t.status]}>{t.status.toLowerCase()}</Badge>
              </CardContent>
            </Card>
          </Link>
        ))}
        {tournaments.length === 0 && (
          <p className="text-sm text-muted-foreground">No tournaments yet — host one above.</p>
        )}
      </div>
    </main>
  );
}

function CreateTournamentForm() {
  async function action(formData: FormData) {
    "use server";
    const name = String(formData.get("name") ?? "");
    const description = String(formData.get("description") ?? "");
    const startggUrl = String(formData.get("startggUrl") ?? "");
    const id = await createTournamentAction(name, description, startggUrl);
    redirect(`/tournaments/${id}`);
  }

  return (
    <form action={action} className="flex flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Name
        <input
          name="name"
          required
          maxLength={100}
          placeholder="e.g. Friday Night Bracket"
          className="h-8 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        start.gg link (optional, add before check-in closes)
        <input
          name="startggUrl"
          type="url"
          placeholder="https://start.gg/tournament/..."
          className="h-8 rounded-lg border border-border bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Description (optional)
        <textarea
          name="description"
          rows={2}
          maxLength={1000}
          placeholder="Rules, format notes, etc."
          className="w-full resize-none rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring"
        />
      </label>
      <Button type="submit" className="self-start">
        Host a tournament
      </Button>
    </form>
  );
}
