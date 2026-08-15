import Link from "next/link";
import { Search } from "lucide-react";
import { auth } from "@/auth";
import { UserRole } from "@/generated/prisma/enums";
import { searchPlayersForAdmin } from "@/lib/admin-players";
import { canManageRoles } from "@/lib/roles";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { reinstate, setRole, setSupporter } from "./actions";

const ROLE_OPTIONS: UserRole[] = [UserRole.USER, UserRole.MOD, UserRole.ADMIN];

export default async function AdminPlayersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; page?: string }>;
}) {
  const session = await auth();
  const role = session?.user?.role;

  if (!session?.user?.id || (role !== "MOD" && role !== "ADMIN")) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <h1 className="text-2xl font-semibold tracking-tight">Players</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          You don&apos;t have access to this page.
        </p>
      </main>
    );
  }

  const canEditRoles = canManageRoles(session.user.id);

  const { q, page: pageParam } = await searchParams;
  const query = q ?? "";
  const requestedPage = Number(pageParam);
  const page = Number.isInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;

  const { players, totalCount, pageSize } = await searchPlayersForAdmin(query, page);
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize));

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <div className="flex items-center gap-2">
        <Search className="size-5 text-muted-foreground" />
        <h1 className="text-2xl font-semibold tracking-tight">Players</h1>
      </div>
      <p className="mt-1 text-sm text-muted-foreground">
        Look up any player, including new accounts that haven&apos;t played enough sets to show
        up on the public leaderboard yet.
      </p>

      <form method="get" className="mt-4 flex items-end gap-2">
        <label className="flex flex-col gap-1 text-sm">
          Username
          <input
            type="text"
            name="q"
            defaultValue={query}
            placeholder="Search by username"
            maxLength={32}
            autoFocus
            className="h-8 w-64 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
          />
        </label>
        <Button type="submit" size="sm" variant="outline">
          Search
        </Button>
      </form>

      <Card className="mt-6 overflow-hidden py-0">
        <table className="w-full text-left text-sm">
          <thead>
            <tr className="border-b border-border text-muted-foreground">
              <th className="py-2 pl-4 font-medium">Player</th>
              <th className="py-2 font-medium">Status</th>
              <th className="py-2 font-medium">Region</th>
              <th className="py-2 font-medium text-right tabular-nums">Rating</th>
              <th className="py-2 font-medium text-right tabular-nums">Sets</th>
              <th className="py-2 font-medium text-center">Ad-free</th>
              {canEditRoles && <th className="py-2 font-medium">Role</th>}
              <th className="py-2 pr-4 font-medium text-right">Joined</th>
            </tr>
          </thead>
          <tbody>
            {players.map((player) => (
              <tr key={player.id} className="border-b border-border/60 last:border-0">
                <td className="py-2 pl-4">
                  <Link href={`/players/${player.id}`} className="hover:underline">
                    {player.username}
                  </Link>
                  {player.role !== "USER" && (
                    <Badge variant="outline" className="ml-2 text-xs">
                      {player.role.toLowerCase()}
                    </Badge>
                  )}
                </td>
                <td className="py-2">
                  {player.status === "ACTIVE" ? (
                    <span className="text-muted-foreground">active</span>
                  ) : (
                    <div className="flex items-center gap-1.5">
                      <Badge variant="destructive" className="text-xs">
                        {player.status.toLowerCase()}
                      </Badge>
                      <form action={reinstate.bind(null, player.id)}>
                        <Button type="submit" size="sm" variant="outline" className="h-6 px-2 text-xs">
                          Reinstate
                        </Button>
                      </form>
                    </div>
                  )}
                </td>
                <td className="py-2 text-muted-foreground">{player.region ?? "—"}</td>
                <td className="py-2 text-right font-medium tabular-nums">{player.rating}</td>
                <td className="py-2 text-right tabular-nums text-muted-foreground">
                  {player.gamesPlayed}
                </td>
                <td className="py-2 text-center">
                  <form action={setSupporter.bind(null, player.id, !player.isSupporter)}>
                    <Button
                      type="submit"
                      size="sm"
                      variant={player.isSupporter ? "default" : "outline"}
                      className="h-6 px-2 text-xs"
                    >
                      {player.isSupporter ? "Supporter" : "—"}
                    </Button>
                  </form>
                </td>
                {canEditRoles && (
                  <td className="py-2">
                    <div className="flex gap-1">
                      {ROLE_OPTIONS.map((roleOption) => (
                        <form key={roleOption} action={setRole.bind(null, player.id, roleOption)}>
                          <Button
                            type="submit"
                            size="sm"
                            variant={player.role === roleOption ? "default" : "outline"}
                            disabled={player.role === roleOption}
                            className="h-6 px-2 text-xs"
                          >
                            {roleOption.toLowerCase()}
                          </Button>
                        </form>
                      ))}
                    </div>
                  </td>
                )}
                <td className="py-2 pr-4 text-right text-xs text-muted-foreground">
                  {player.createdAt.toLocaleDateString("en-US", { dateStyle: "medium" })}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        {players.length === 0 && (
          <p className="p-4 text-sm text-muted-foreground">
            {query ? `No players matching "${query}".` : "No players yet."}
          </p>
        )}
      </Card>

      {totalCount > 0 && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <Badge variant="outline">
            {totalCount} player{totalCount === 1 ? "" : "s"}
          </Badge>
          {totalPages > 1 && (
            <div className="flex items-center gap-2 text-sm">
              <PageLink page={page - 1} query={query || undefined} disabled={page <= 1}>
                ← Previous
              </PageLink>
              <span className="text-muted-foreground tabular-nums">
                Page {page} of {totalPages}
              </span>
              <PageLink page={page + 1} query={query || undefined} disabled={page >= totalPages}>
                Next →
              </PageLink>
            </div>
          )}
        </div>
      )}
    </main>
  );
}

function PageLink({
  page,
  query,
  disabled,
  children,
}: {
  page: number;
  query?: string;
  disabled: boolean;
  children: React.ReactNode;
}) {
  if (disabled) {
    return <span className="text-muted-foreground/40">{children}</span>;
  }
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("page", String(page));
  return (
    <Link href={`/admin/players?${params.toString()}`} className="hover:underline">
      {children}
    </Link>
  );
}
