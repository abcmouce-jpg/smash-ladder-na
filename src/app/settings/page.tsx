import { headers } from "next/headers";
import { Settings } from "lucide-react";
import Link from "next/link";
import { auth } from "@/auth";
import { prisma } from "@/lib/db";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ArenaPasswordForm } from "@/components/arena-password-form";
import { OwnCharactersForm } from "@/components/own-characters-form";
import { listBlockedUsers } from "@/lib/blocks";
import { REMATCH_COOLDOWN_PRESETS } from "@/lib/rematch-cooldown";
import { DEFAULT_ARENA_PASSWORD } from "@/lib/arena";
import { startggProfileUrl } from "@/lib/startgg-oauth";
import {
  disconnectStartggAction,
  disconnectTwitchAction,
  updateArenaPassword,
  updateAvoidPracticeOpponentsSetting,
  updateOwnCharacters,
  updateRematchCooldownSetting,
  updateUsername,
} from "./actions";

const ANYTIME_VALUE = "anytime";

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<{ startggConnected?: string; startggError?: string; twitchConnected?: string; twitchError?: string }>;
}) {
  const session = await auth();
  const { startggConnected, startggError, twitchConnected, twitchError } = await searchParams;
  const host = (await headers()).get("host") ?? "";
  const protocol = process.env.NODE_ENV === "development" ? "http" : "https";

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
      select: {
        username: true,
        startggUserId: true,
        startggSlug: true,
        startggGamerTag: true,
        twitchUserId: true,
        twitchUsername: true,
        twitchDisplayName: true,
        twitchProfileImageUrl: true,
        rematchCooldownHours: true,
        arenaPassword: true,
        avoidPracticeOpponents: true,
        mainCharacter: true,
        secondaryCharacters: true,
        charactersSelfDeclared: true,
      },
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
          <TwitchConnectCard
            connected={
              me?.twitchUserId && me.twitchUsername
                ? { username: me.twitchUsername, displayName: me.twitchDisplayName, profileImageUrl: me.twitchProfileImageUrl }
                : null
            }
            justConnected={twitchConnected === "1"}
            error={twitchError}
          />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <StreamOverlayCard userId={session.user.id} host={host} protocol={protocol} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <StartggConnectCard
            connected={
              me?.startggUserId && me.startggSlug
                ? { slug: me.startggSlug, gamerTag: me.startggGamerTag }
                : null
            }
            justConnected={startggConnected === "1"}
            error={startggError}
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
          <AvoidPracticeOpponentsForm defaultValue={me?.avoidPracticeOpponents ?? false} />
        </CardContent>
      </Card>

      <Card className="mt-4">
        <CardContent className="pt-4">
          <OwnCharactersForm
            action={updateOwnCharacters}
            defaultMainCharacter={me?.mainCharacter ?? ""}
            defaultSecondaryCharacters={me?.secondaryCharacters ?? []}
            selfDeclared={me?.charactersSelfDeclared ?? false}
          />
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

function StreamOverlayCard({ userId, host, protocol }: { userId: string; host: string; protocol: string }) {
  const overlayUrl = `${protocol}://${host}/stream/overlay/${userId}`;

  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-medium">Stream overlay</p>
      <p className="text-xs text-muted-foreground">
        Use this URL as an OBS Browser Source to show your rating, recent matches, and current
        match info on stream.
      </p>
      <div className="mt-1 flex items-center gap-2">
        <code className="rounded-md border border-border bg-muted px-2 py-1 text-xs font-mono break-all max-w-full">
          {overlayUrl}
        </code>
        <a
          href={overlayUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="shrink-0"
        >
          <Button type="button" size="sm" variant="outline">
            Open
          </Button>
        </a>
      </div>
    </div>
  );
}

function TwitchConnectCard({
  connected,
  justConnected,
  error,
}: {
  connected: { username: string; displayName: string | null; profileImageUrl: string | null } | null;
  justConnected: boolean;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-medium">Twitch account</p>
      <p className="text-xs text-muted-foreground">
        Connect your Twitch account to access a custom stream overlay page. The overlay shows your
        rating, rank, and recent matches — perfect as an OBS Browser Source for your stream.
      </p>
      {connected ? (
        <>
          {justConnected && <p className="text-xs text-emerald-600">Connected!</p>}
          <div className="mt-1 flex items-center gap-2">
            {connected.profileImageUrl && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={connected.profileImageUrl}
                alt=""
                className="size-6 rounded-full"
              />
            )}
            <span className="font-medium">
              {connected.displayName ?? connected.username} ✓
            </span>
            <form action={disconnectTwitchAction}>
              <Button type="submit" size="sm" variant="outline">
                Disconnect
              </Button>
            </form>
          </div>
        </>
      ) : (
        <a href="/api/twitch/connect" className="mt-1 self-start">
          <Button type="button" size="sm">
            Connect with Twitch
          </Button>
        </a>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function StartggConnectCard({
  connected,
  justConnected,
  error,
}: {
  connected: { slug: string; gamerTag: string | null } | null;
  justConnected: boolean;
  error?: string;
}) {
  return (
    <div className="flex flex-col gap-1.5 text-sm">
      <p className="font-medium">start.gg profile</p>
      <p className="text-xs text-muted-foreground">
        Verified via start.gg sign-in, not a link you type in — so nobody else can claim your
        results as their own.
      </p>
      {connected ? (
        <>
          {justConnected && <p className="text-xs text-emerald-600">Connected!</p>}
          <div className="mt-1 flex items-center gap-2">
            <a
              href={startggProfileUrl(connected.slug)}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium hover:underline"
            >
              {connected.gamerTag ?? connected.slug} ✓
            </a>
            <form action={disconnectStartggAction}>
              <Button type="submit" size="sm" variant="outline">
                Disconnect
              </Button>
            </form>
          </div>
        </>
      ) : (
        <a href="/api/startgg/connect" className="mt-1 self-start">
          <Button type="button" size="sm">
            Connect with start.gg
          </Button>
        </a>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
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

function AvoidPracticeOpponentsForm({ defaultValue }: { defaultValue: boolean }) {
  async function action(formData: FormData) {
    "use server";
    await updateAvoidPracticeOpponentsSetting(formData.get("avoidPracticeOpponents") === "on");
  }

  return (
    <form action={action} className="flex items-end justify-between gap-2">
      <label className="flex items-center gap-2 text-sm">
        <input
          key={String(defaultValue)}
          type="checkbox"
          name="avoidPracticeOpponents"
          defaultChecked={defaultValue}
          className="size-4 rounded border-border"
        />
        <span>
          Don&apos;t match me with opponents who are practicing
          <span className="block text-xs font-normal text-muted-foreground">
            A practicing opponent&apos;s main character is banned for them and their result won&apos;t
            affect their rank — turn this on to skip those matches entirely.
          </span>
        </span>
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
