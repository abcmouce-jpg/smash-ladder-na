import { Flag } from "lucide-react";
import { auth } from "@/auth";
import { getHiddenGuidesForModeration } from "@/lib/character-guides";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { removeGuideAction, unhideGuideAction } from "./actions";

export default async function AdminGuidesPage() {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user?.id || (role !== "MOD" && role !== "ADMIN")) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Flagged guides</h1>
        <p className="mt-2 text-sm text-muted-foreground">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const guides = await getHiddenGuidesForModeration();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Flag className="size-6 text-primary" />
        Flagged guides
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        Community character guides auto-hidden after enough flags. Unhide if the flags were unwarranted, or remove it
        for good.
      </p>

      {guides.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">Nothing flagged right now.</p>
      ) : (
        <ul className="mt-6 flex flex-col gap-3">
          {guides.map((guide) => (
            <li key={guide.id}>
              <Card>
                <CardContent className="pt-4">
                  <div className="flex items-center gap-2">
                    <Badge variant="secondary">{guide.character}</Badge>
                    <span className="text-xs text-muted-foreground">
                      by {guide.author.username} · {guide.flagCount} flags
                    </span>
                  </div>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{guide.content}</p>
                  <div className="mt-3 flex gap-2">
                    <form action={unhideGuideAction.bind(null, guide.id)}>
                      <Button type="submit" size="sm" variant="outline">
                        Unhide
                      </Button>
                    </form>
                    <form action={removeGuideAction.bind(null, guide.id)}>
                      <Button type="submit" size="sm" variant="destructive">
                        Remove
                      </Button>
                    </form>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
