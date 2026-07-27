import { Settings } from "lucide-react";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { StartggUrlForm } from "@/components/startgg-url-form";
import { ArenaPasswordForm } from "@/components/arena-password-form";
import { listBlockedUsers } from "@/lib/blocks";
import { REMATCH_COOLDOWN_PRESETS } from "@/lib/rematch-cooldown";
import { DEFAULT_ARENA_PASSWORD } from "@/lib/arena";
import { updateArenaPassword, updateRematchCooldownSetting, updateStartggUrl, updateUsername } from "./actions";

const ANYTIME_VALUE = "anytime";

export default async function SettingsPage() {
  const session = await auth();

  if (!session?.user?.id) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <PageTitle />
        <p className="mt-2 text-sm text-muted-foreground">
          Sign in with Discord (top right) to manage your settings.
        </p>
      </main>
    );
  }

  const [me, blocked] = await Promise.all([
    prisma.user.findUnique({
      where: { id: session.user.id },
      select: { username: true, startggUrl: true, rematchCooldownHours: true, arenaPassword: true },
    }),
    listBlockedUsers(session.user.id),
  ]);

  return (
    <main className="mx-auto max-w-2xl px-6 py-16">
      <PageTitle />

      <Card className="mt-8">
        <CardContent className="pt-4">
          <UsernameForm defaultValue={me?.username ?? ""} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <StartggUrlForm
            action={updateStartggUrl}
            defaultValue={me?.startggUrl ?? ""}
            label="start.gg profile"
            description="Self-declared — link your start.gg profile so others can look up your results."
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <RematchCooldownForm defaultValue={me?.rematchCooldownHours ?? null} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <ArenaPasswordForm
            action={updateArenaPassword}
            defaultValue={me?.arenaPassword ?? ""}
            fallback={DEFAULT_ARENA_PASSWORD}
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <p className="text-sm font-medium">Blocked players</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Blocked players are never matched with you in ranked queueing. Blocking is permanent
            and can&apos;t be undone.
          </p>
          {blocked.length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">You haven&apos;t blocked anyone.</p>
          ) : (
            <ul className="mt-3 flex flex-col gap-2">
              {blocked.map((b) => (
                <li key={b.id} className="text-sm">
                  <Link href={`/players/${b.blocked.id}`} className="hover:underline">
                    {b.blocked.username}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </main>
  );
}

function PageTitle() {
  return (
    <div className="flex items-center gap-2">
      <Settings className="size-5 text-muted-foreground" />
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
    </div>
  );
}

function UsernameForm({ defaultValue }: { defaultValue: string }) {
  async function action(formData: FormData) {
    "use server";
    await updateUsername(String(formData.get("username") ?? ""));
  }

  return (
    <form action={action} className="flex items-end gap-2">
      <label className="flex flex-1 flex-col gap-1 text-sm">
        Username
        <span className="text-xs font-normal text-muted-foreground">
          Shown everywhere on the site instead of your Discord name — handy if they don&apos;t
          match.
        </span>
        <input
          name="username"
          type="text"
          required
          maxLength={32}
          defaultValue={defaultValue}
          className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
        />
      </label>
      <Button type="submit" size="sm">
        Save
      </Button>
    </form>
  );
}

function RematchCooldownForm({ defaultValue }: { defaultValue: number | null }) {
  async function action(formData: FormData) {
    "use server";
    const value = String(formData.get("rematchCooldownHours") ?? "");
    await updateRematchCooldownSetting(value === ANYTIME_VALUE ? null : Number(value));
  }

  return (
    <form action={action} className="flex items-end gap-2">
      <label className="flex flex-1 flex-col gap-1 text-sm">
        Rematch cooldown
        <span className="text-xs font-normal text-muted-foreground">
          Minimum time before you can be matched with the same opponent again. Matching requires
          BOTH players&apos; cooldown to have elapsed.
        </span>
        <select
          name="rematchCooldownHours"
          defaultValue={String(defaultValue ?? ANYTIME_VALUE)}
          className="h-8 w-52 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
        >
          {REMATCH_COOLDOWN_PRESETS.map((preset) => (
            <option
              key={preset.label}
              value={String(preset.hours ?? ANYTIME_VALUE)}
              className="bg-background text-foreground"
            >
              {preset.label}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" size="sm">
        Save
      </Button>
    </form>
  );
}
