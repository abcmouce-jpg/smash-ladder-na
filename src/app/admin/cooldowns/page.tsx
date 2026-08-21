import Link from "next/link";
import { Timer } from "lucide-react";
import { auth } from "@/auth";
import { listActiveCooldowns } from "@/lib/queue-cooldown";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { clearCooldownAction } from "./actions";

function minutesRemaining(until: Date, now: Date) {
  return Math.max(1, Math.ceil((until.getTime() - now.getTime()) / (60 * 1000)));
}

export default async function AdminCooldownsPage() {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user?.id || (role !== "MOD" && role !== "ADMIN")) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Cooldowns</h1>
        <p className="mt-2 text-sm text-muted-foreground">You don&apos;t have access to this page.</p>
      </main>
    );
  }

  const now = new Date();
  const cooldowns = await listActiveCooldowns(now);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Timer className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Cooldowns</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Players currently locked out of the queue for going AFK (see applyTimeoutCooldown) — 5 min per consecutive
        timeout, escalating. Clearing here only waives the active cooldown; their no-show count and escalation streak
        are left alone, so it keeps climbing from here if they time out again.
      </p>

      <div className="mt-6 flex flex-col gap-2">
        {cooldowns.length === 0 && <p className="text-sm text-muted-foreground">Nobody&apos;s on cooldown right now.</p>}
        {cooldowns.map((c) => (
          <Card key={c.id} className="py-0">
            <CardContent className="flex flex-wrap items-center gap-3 py-3">
              <div className="min-w-0 flex-1">
                <Link href={`/players/${c.id}`} className="font-medium hover:underline">
                  {c.username}
                </Link>
                <p className="mt-0.5 text-xs text-muted-foreground tabular-nums">
                  {minutesRemaining(c.queueCooldownUntil, now)} min remaining · {c.recentTimeoutCount} recent timeout
                  {c.recentTimeoutCount === 1 ? "" : "s"} · {c.noShowCount} no-shows total
                </p>
              </div>
              <form action={clearCooldownAction.bind(null, c.id)}>
                <Button type="submit" variant="secondary" size="sm">
                  Clear cooldown
                </Button>
              </form>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}
