import Image from "next/image";
import Link from "next/link";
import { Users } from "lucide-react";
import { auth } from "@/auth";
import { getAchievedFreeBattleTiers, getOwnActivePost, getUserBrief } from "@/lib/free-battle";
import { FREE_BATTLE_TIERS, type FreeBattleTier } from "@/lib/rank-tier";
import { PageHeading } from "@/components/page-heading";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdSlot } from "@/components/ad-slot";
import { closeFreeBattlePost, postFreeBattle } from "./actions";
import { getLang, type Lang } from "@/lib/i18n";

export default async function BoardPage() {
  const [session, lang] = await Promise.all([auth(), getLang()]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <PageHeading
        icon={Users}
        title={lang === "es" ? "Tablón" : "Board"}
        description={
          lang === "es" ? (
            <>
              Un tablón para amistosos casuales sin clasificación — no hay puntos en juego y no hay emparejamiento
              automático. Es lo opuesto a la cola rankeada de la{" "}
              <Link href="/lobby" className="underline hover:text-foreground">
                Sala
              </Link>
              : tú publicas lo que buscas y quien lo vea en Discord te contacta directamente.
            </>
          ) : (
            <>
              A bulletin board for casual, unranked friendlies — no rating on the line, and no auto-matching. It&apos;s
              the opposite of the{" "}
              <Link href="/lobby" className="underline hover:text-foreground">
                Lobby
              </Link>
              &apos;s ranked queue: here, you post what you want and whoever sees it on Discord reaches out to you
              directly.
            </>
          )
        }
      >
        <ol className="mt-3 flex max-w-xl list-none flex-col gap-1 text-xs text-muted-foreground">
          {lang === "es" ? (
            <>
              <li>1. Publica qué buscas (matchup, disponibilidad, etc).</li>
              <li>2. Tu publicación se anuncia en el Discord de la comunidad.</li>
              <li>3. Quien esté interesado te contacta por Discord — el Tablón solo hace la presentación.</li>
              <li>
                4. Las publicaciones expiran solas después de 24 horas; ciérrala y vuelve a publicar cuando quieras.
              </li>
            </>
          ) : (
            <>
              <li>1. Post what you&apos;re looking for (matchup, availability, etc).</li>
              <li>2. Your post gets announced in the community Discord.</li>
              <li>3. Whoever&apos;s interested reaches out on Discord — the Board just makes the introduction.</li>
              <li>4. Posts auto-expire after 24 hours; close and repost anytime.</li>
            </>
          )}
        </ol>
      </PageHeading>

      {!session?.user?.id ? (
        <Card className="mt-6">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              {lang === "es"
                ? "Inicia sesión con Discord (arriba a la derecha) para publicar o unirte a un post."
                : "Sign in with Discord (top right) to post or join a board post."}
            </p>
          </CardContent>
        </Card>
      ) : (
        <BoardActionsPanel userId={session.user.id} lang={lang} />
      )}

      <AdSlot slot={process.env.NEXT_PUBLIC_ADSENSE_SLOT_FREE_BATTLE} />
    </main>
  );
}

async function BoardActionsPanel({ userId, lang }: { userId: string; lang: Lang }) {
  const [ownPost, achievedTiers] = await Promise.all([getOwnActivePost(userId), getAchievedFreeBattleTiers(userId)]);

  return (
    <div className="mt-6">
      {ownPost ? <OwnPostCard post={ownPost} lang={lang} /> : <PostForm lang={lang} achievedTiers={achievedTiers} />}
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
    <Card>
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
      <Card>
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
    <Card>
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
            ? "Contáctalo por Discord para acordar el código de sala — el Tablón no lleva registro de la partida en sí."
            : "Reach out to them on Discord to set up your room code — the Board doesn't track the game itself."}
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
