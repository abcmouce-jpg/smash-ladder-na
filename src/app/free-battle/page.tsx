import Image from "next/image";
import Link from "next/link";
import { Users } from "lucide-react";
import { auth } from "@/auth";
import { getAchievedFreeBattleTiers, getOwnActivePost, getUserBrief, listOpenPosts } from "@/lib/free-battle";
import { getUserRegion } from "@/lib/players";
import { FREE_BATTLE_TIERS, type FreeBattleTier } from "@/lib/rank-tier";
import { SMASH_CHARACTERS, MAX_FREE_BATTLE_CHARACTERS, echoGroupLabel, type SmashCharacter } from "@/lib/characters";
import { MATCH_DISTANCE_PRESETS } from "@/lib/regions";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { AdSlot } from "@/components/ad-slot";
import { CharacterFilterSelect } from "@/components/character-filter-select";
import { CharacterMultiSelect } from "@/components/character-multi-select";
import { CharacterIcon } from "@/components/character-icon";
import { OptionSelect, type OptionSelectOption } from "@/components/option-select";
import { claimFreeBattlePost, closeFreeBattlePost, postFreeBattle } from "./actions";
import { getLang, type Lang } from "@/lib/i18n";

const DISTANCE_OPTIONS: OptionSelectOption[] = MATCH_DISTANCE_PRESETS.map((p) => ({
  value: p.km === null ? "worldwide" : String(p.km),
  label: p.label,
}));

// undefined means "no distance filter" (param missing/unrecognized); null
// means the "Worldwide" preset, which is also unfiltered but explicitly
// chosen — both end up not touching the query, see listOpenPosts.
function parseDistanceParam(raw: string | undefined): number | null | undefined {
  if (!raw) return undefined;
  if (raw === "worldwide") return null;
  const km = Number(raw);
  return Number.isFinite(km) ? km : undefined;
}

export default async function FreeBattlePage({
  searchParams,
}: {
  searchParams: Promise<{ character?: string; distance?: string }>;
}) {
  const [session, lang, { character, distance }] = await Promise.all([auth(), getLang(), searchParams]);
  const isValidCharacter = character && (SMASH_CHARACTERS as readonly string[]).includes(character);
  const maxDistanceKm = parseDistanceParam(distance);
  const distanceLabel = DISTANCE_OPTIONS.find((o) => o.value === distance)?.label;

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
  const [ownPost, achievedTiers, viewerRegion] = await Promise.all([
    getOwnActivePost(userId),
    getAchievedFreeBattleTiers(userId),
    getUserRegion(userId),
  ]);
  const openPosts = await listOpenPosts(userId, {
    character: isValidCharacter ? character : null,
    viewerRegion,
    maxDistanceKm,
  });

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
          {isValidCharacter &&
            (lang === "es"
              ? ` — jugadores de ${echoGroupLabel(character as SmashCharacter)}`
              : ` — ${echoGroupLabel(character as SmashCharacter)} players`)}
          {distanceLabel && ` (${distanceLabel})`}
        </h2>
        <form method="get" className="mt-3 flex flex-wrap items-end gap-2">
          <CharacterFilterSelect defaultValue={isValidCharacter ? character : ""} lang={lang} className="w-full md:w-40" />
          <label className="flex w-full flex-col gap-1 text-sm md:w-auto">
            {lang === "es" ? "Distancia" : "Distance"}
            <OptionSelect
              key={distanceLabel ? distance : ""}
              name="distance"
              defaultValue={distanceLabel ? distance : ""}
              placeholder={lang === "es" ? "Cualquier distancia" : "Any distance"}
              clearLabel={lang === "es" ? "Cualquier distancia" : "Any distance"}
              className="w-full md:w-48"
              options={DISTANCE_OPTIONS}
              autoSubmit
            />
          </label>
          <Button type="submit" size="sm" variant="outline" className="h-8 w-full md:w-auto">
            {lang === "es" ? "Filtrar" : "Filter"}
          </Button>
        </form>
        {!viewerRegion && typeof maxDistanceKm === "number" && (
          <p className="mt-2 text-xs text-muted-foreground">
            {lang === "es"
              ? "Configura tu región en la página de Sala para usar el filtro de distancia."
              : "Set your region on the Lobby page to use the distance filter."}
          </p>
        )}
        {openPosts.length === 0 && (
          <p className="mt-4 text-sm text-muted-foreground">
            {isValidCharacter || maxDistanceKm !== undefined
              ? lang === "es"
                ? "Ninguna publicación abierta coincide con estos filtros."
                : "No open posts match those filters."
              : lang === "es"
                ? "No hay publicaciones abiertas por ahora."
                : "No open posts right now."}
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
                        {post.characters.length > 0 && (
                          <div className="mt-1 flex items-center gap-1">
                            {post.characters.map((c) => (
                              <CharacterIcon key={c} name={c} size={16} />
                            ))}
                          </div>
                        )}
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
    const characters = formData.getAll("characters").map(String);
    await postFreeBattle(comment, minTier, characters);
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
          <label className="flex flex-col gap-1 text-sm">
            {lang === "es" ? "¿Qué personajes? (opcional)" : "Which characters? (optional)"}
            <CharacterMultiSelect
              name="characters"
              placeholder={lang === "es" ? "Sin especificar" : "Not specified"}
              className="w-full"
            />
            <span className="text-xs text-muted-foreground">
              {lang === "es"
                ? `Solo para etiquetar tu publicación (hasta ${MAX_FREE_BATTLE_CHARACTERS}) — cualquiera puede unirse igual; ayuda a que te encuentren en el filtro de abajo.`
                : `Just tags the post (up to ${MAX_FREE_BATTLE_CHARACTERS}) — anyone can still join, this only helps people find it via the filter below.`}
            </span>
          </label>
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
          {post.characters.length > 0 && (
            <div className="mt-2 flex items-center gap-1">
              {post.characters.map((c) => (
                <CharacterIcon key={c} name={c} size={16} />
              ))}
            </div>
          )}
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
