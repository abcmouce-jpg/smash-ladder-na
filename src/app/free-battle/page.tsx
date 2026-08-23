import Image from "next/image";
import Link from "next/link";
import { Users } from "lucide-react";
import { auth } from "@/auth";
import { getAchievedFreeBattleTiers, getOwnActivePost, getUserBrief, listOpenPosts } from "@/lib/free-battle";
import { FREE_BATTLE_TIERS, type FreeBattleTier } from "@/lib/rank-tier";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdSlot } from "@/components/ad-slot";
import { claimFreeBattlePost, closeFreeBattlePost, postFreeBattle } from "./actions";
import { getLang, type Lang } from "@/lib/i18n";

export default async function FreeBattlePage() {
  const [session, lang] = await Promise.all([auth(), getLang()]);

  if (!session?.user?.id) {
    return (
      <main className="mx-auto w-full max-w-3xl px-6 py-16">
        <PageTitle />
        <p className="mt-2 text-sm text-muted-foreground">
          {lang === "es"
            ? "Inicia sesión con Discord (arriba a la derecha) para publicar o unirte a un free battle."
            : "Sign in with Discord (top right) to post or join a free battle."}
        </p>
      </main>
    );
  }

  const userId = session.user.id;
  const [ownPost, openPosts, achievedTiers] = await Promise.all([
    getOwnActivePost(userId),
    listOpenPosts(userId),
    getAchievedFreeBattleTiers(userId),
  ]);

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <PageTitle />
      <p className="mt-1 text-sm text-muted-foreground">
        {lang === "es" ? (
          <>
            Un tablón de anuncios para amistosos casuales, sin afectar la clasificación — sin impacto en tu rating, y
            sin emparejamiento automático. Es lo opuesto a la cola rankeada de la{" "}
            <Link href="/lobby" className="underline hover:text-foreground">
              Sala
            </Link>
            : aquí publicas lo que buscas y eliges con quién jugar, en vez de que te emparejen automáticamente.
          </>
        ) : (
          <>
            A bulletin board for casual, unranked friendlies — no rating on the line, and no auto-matching. It&apos;s
            the opposite of the{" "}
            <Link href="/lobby" className="underline hover:text-foreground">
              Lobby
            </Link>
            &apos;s ranked queue: here, you post what you want and pick who to play, instead of being paired
            automatically.
          </>
        )}
      </p>
      <ul className="mt-3 flex flex-col gap-1 text-xs text-muted-foreground">
        {lang === "es" ? (
          <>
            <li>1. Publica un comentario diciendo qué buscas (matchup, disponibilidad, etc).</li>
            <li>
              2. Cualquiera puede ver las publicaciones abiertas y presionar &quot;Voy&quot; para reclamar la tuya —
              recibirás un DM de Discord en cuanto alguien lo haga.
            </li>
            <li>
              3. Una vez emparejados, coordinen la partida ustedes mismos (código de sala, horario) — Free Battle solo
              hace la presentación, no lleva registro de los juegos ni afecta tu clasificación como las partidas
              rankeadas.
            </li>
            <li>
              4. Las publicaciones expiran solas después de 24 horas; ciérrala y vuelve a publicar cuando quieras.
            </li>
          </>
        ) : (
          <>
            <li>1. Post a comment saying what you&apos;re looking for (matchup, availability, etc).</li>
            <li>
              2. Anyone can browse open posts and hit &quot;I&apos;m in&quot; to claim yours — you&apos;ll get a Discord
              DM the moment someone does.
            </li>
            <li>
              3. Once matched, coordinate the actual set yourselves (room code, timing) — Free Battle just makes the
              introduction, it doesn&apos;t track games or affect your rating like ranked matches do.
            </li>
            <li>4. Posts auto-expire after 24 hours; close and repost anytime.</li>
          </>
        )}
      </ul>

      {ownPost ? <OwnPostCard post={ownPost} lang={lang} /> : <PostForm lang={lang} achievedTiers={achievedTiers} />}

      <div className="mt-10">
        <h2 className="text-sm font-medium text-muted-foreground">
          {lang === "es" ? "Publicaciones abiertas" : "Open posts"}
        </h2>
        {openPosts.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            {lang === "es" ? "No hay publicaciones abiertas por ahora." : "No open posts right now."}
          </p>
        )}
        <ul className="mt-4 flex flex-col gap-3">
          {openPosts.map((post) => {
            const minTier = post.minTier as FreeBattleTier | null;
            const canClaim = !minTier || achievedTiers.includes(minTier);
            return (
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
                          {minTier && <Badge>{minTier}+</Badge>}
                          {post.region && <Badge variant="outline">{post.region}</Badge>}
                        </p>
                        <p className="mt-0.5 text-sm text-muted-foreground">{post.comment}</p>
                      </div>
                    </div>
                    {canClaim ? (
                      <form action={claimFreeBattlePost.bind(null, post.id)}>
                        <Button type="submit" size="sm">
                          {lang === "es" ? "Voy" : "I'm in"}
                        </Button>
                      </form>
                    ) : (
                      <Button type="button" size="sm" disabled title={`${minTier}+ only`}>
                        {lang === "es" ? "Voy" : "I'm in"}
                      </Button>
                    )}
                  </CardContent>
                </Card>
              </li>
            );
          })}
        </ul>
      </div>

      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_FREE_BATTLE} />
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

function PostForm({ lang, achievedTiers }: { lang: Lang; achievedTiers: FreeBattleTier[] }) {
  async function action(formData: FormData) {
    "use server";
    const comment = String(formData.get("comment") ?? "");
    const rawMinTier = String(formData.get("minTier") ?? "");
    const minTier = FREE_BATTLE_TIERS.includes(rawMinTier as FreeBattleTier) ? (rawMinTier as FreeBattleTier) : null;
    await postFreeBattle(comment, minTier);
  }

  // FREE_BATTLE_TIERS is ordered highest to lowest; the form should offer
  // them the other way round (Elite before Grandmaster) so restricting to
  // your own rank is the first, most obvious option below "Anyone".
  const selectableTiers = [...FREE_BATTLE_TIERS].reverse().filter((tier) => achievedTiers.includes(tier));

  return (
    <Card className="mt-8">
      <CardContent className="pt-4">
        <form action={action} className="flex flex-col gap-3">
          <label className="flex flex-col gap-1 text-sm">
            {lang === "es" ? "¿Qué estás buscando?" : "What are you looking for?"}
            <textarea
              name="comment"
              required
              rows={2}
              placeholder={
                lang === "es"
                  ? "p. ej. Busco amistosos, Fox/Falco, tardes hora del centro"
                  : "e.g. Looking for friendlies, Fox/Falco, EST evenings"
              }
              className="w-full resize-none rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring"
            />
          </label>
          {selectableTiers.length > 0 && (
            <label className="flex flex-col gap-1 text-sm">
              {lang === "es" ? "¿Quién puede unirse?" : "Who can join?"}
              <select
                name="minTier"
                defaultValue=""
                className="w-full rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring"
              >
                <option value="">{lang === "es" ? "Cualquiera" : "Anyone"}</option>
                {selectableTiers.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}+
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                {lang === "es"
                  ? "Todos ven la publicación, pero solo quienes hayan alcanzado ese rango pueden unirse — y se anuncia en el canal de Discord de ese rango en vez del general."
                  : "Everyone sees the post, but only players who've reached that rank can join — and it announces in that rank's Discord channel instead of the general one."}
              </span>
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            {lang === "es"
              ? "La región se toma de tu perfil — configúrala en la página de Sala."
              : "Region is pulled from your profile — set it on the Lobby page."}
          </p>
          <Button type="submit" className="self-start">
            {lang === "es" ? "Publicar" : "Post"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

async function OwnPostCard({
  post,
  lang,
}: {
  post: NonNullable<Awaited<ReturnType<typeof getOwnActivePost>>>;
  lang: Lang;
}) {
  if (post.status === "OPEN") {
    return (
      <Card className="mt-8">
        <CardContent className="pt-4">
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            {lang === "es"
              ? "Tu publicación está activa. Esperando a que alguien se una…"
              : "Your post is live. Waiting for someone to join…"}
            {post.minTier && <Badge>{post.minTier}+</Badge>}
          </p>
          <form action={closeFreeBattlePost.bind(null, post.id)} className="mt-3">
            <Button type="submit" variant="outline" size="sm">
              {lang === "es" ? "Cerrar publicación" : "Close post"}
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
        <Badge variant="success">{lang === "es" ? "¡Emparejado!" : "Matched!"}</Badge>
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
        <p className="mt-2 text-xs text-muted-foreground">
          {lang === "es"
            ? "Contáctalo por Discord para acordar el código de sala — Free Battle no lleva registro de la partida en sí."
            : "Reach out to them on Discord to set up your room code — Free Battle doesn't track the game itself."}
        </p>
        <form action={closeFreeBattlePost.bind(null, post.id)} className="mt-3">
          <Button type="submit" variant="outline" size="sm">
            {lang === "es" ? "Listo — publicar de nuevo" : "Done — post again"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
