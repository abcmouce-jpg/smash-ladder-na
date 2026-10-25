import Image from "next/image";
import Link from "next/link";
import { Users } from "lucide-react";
import { auth } from "@/auth";
import { getAchievedFreeBattleTiers, getOwnActivePost, getUserBrief } from "@/lib/free-battle";
import { getFriendliesPosts } from "@/lib/home-feed";
import { FREE_BATTLE_TIERS, type FreeBattleTier } from "@/lib/rank-tier";
import { PageHeading } from "@/components/page-heading";
import { SectionHeading } from "@/components/section-heading";
import { FriendliesPosts } from "@/components/friendlies-posts";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { closeFreeBattlePost, postFreeBattle } from "./actions";
import { getLang, type Lang } from "@/lib/i18n";
import { tr, trNode } from "@/lib/lang";

export default async function FriendliesPage() {
  const [session, lang, posts] = await Promise.all([auth(), getLang(), getFriendliesPosts(20)]);

  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:px-6 sm:py-12">
      <PageHeading
        icon={Users}
        title={tr(lang, {
          en: "Friendlies",
          es: "Amistosos",
          ja: "フリー対戦",
        })}
        description={trNode(lang, {
          en: (
            <>
              Post what you&apos;re looking for and get casual, unranked friendlies going — no rating on the line, and
              no auto-matching. It&apos;s the opposite of the{" "}
              <Link href="/lobby" className="underline hover:text-foreground">
                Lobby
              </Link>
              &apos;s ranked queue: here, you post what you want and whoever sees it on Discord reaches out to you
              directly.
            </>
          ),
          es: (
            <>
              Publica lo que buscas y arma amistosos casuales sin clasificación — no hay puntos en juego ni
              emparejamiento automático. Es lo opuesto a la cola rankeada de la{" "}
              <Link href="/lobby" className="underline hover:text-foreground">
                Sala
              </Link>
              : tú publicas lo que buscas y quien lo vea en Discord te contacta directamente.
            </>
          ),
          ja: (
            <>
              探している対戦を投稿して、レートのかからない気軽なフリー対戦を組みましょう。レートは動かず、自動マッチングもありません。
              <Link href="/lobby" className="underline hover:text-foreground">
                ロビー
              </Link>
              のレート対戦とは逆で、自分で希望を投稿し、Discord で見た人が直接連絡してくる形です。
            </>
          ),
        })}
      >
        <ol className="mt-3 flex max-w-xl list-none flex-col gap-1 text-xs text-muted-foreground">
          {trNode(lang, {
            en: (
              <>
                <li>1. Post what you&apos;re looking for (matchup, availability, etc).</li>
                <li>2. Your post gets announced in the community Discord.</li>
                <li>3. Whoever&apos;s interested reaches out on Discord — this page just makes the introduction.</li>
                <li>4. Posts auto-expire after 24 hours; close and repost anytime.</li>
              </>
            ),
            es: (
              <>
                <li>1. Publica qué buscas (matchup, disponibilidad, etc).</li>
                <li>2. Tu publicación se anuncia en el Discord de la comunidad.</li>
                <li>3. Quien esté interesado te contacta por Discord — esta página solo hace la presentación.</li>
                <li>
                  4. Las publicaciones expiran solas después de 24 horas; ciérrala y vuelve a publicar cuando quieras.
                </li>
              </>
            ),
            ja: (
              <>
                <li>1. 探している対戦を投稿する（対面したいキャラ、対戦できる時間帯など）。</li>
                <li>2. 投稿がコミュニティの Discord に告知される。</li>
                <li>3. 興味を持った人が Discord で連絡してくる。このページは紹介までを担います。</li>
                <li>4. 投稿は24時間で自動的に期限切れになります。いつでも閉じて再投稿できます。</li>
              </>
            ),
          })}
        </ol>
      </PageHeading>

      {!session?.user?.id ? (
        <Card className="mt-6">
          <CardContent className="pt-4">
            <p className="text-sm text-muted-foreground">
              {tr(lang, {
                en: "Sign in with Discord (top right) to post or join a post.",
                es: "Inicia sesión con Discord (arriba a la derecha) para publicar o unirte a un post.",
                ja: "右上の Discord でログインすると、募集を投稿したり参加したりできます。",
              })}
            </p>
          </CardContent>
        </Card>
      ) : (
        <FriendliesActionsPanel userId={session.user.id} lang={lang} />
      )}

      <div className="mt-10">
        <SectionHeading
          label={tr(lang, {
            en: "Open posts",
            es: "Publicaciones abiertas",
            ja: "募集中",
          })}
        />
        <FriendliesPosts posts={posts} lang={lang} />
      </div>
    </main>
  );
}

async function FriendliesActionsPanel({ userId, lang }: { userId: string; lang: Lang }) {
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
            {tr(lang, {
              en: "What are you looking for?",
              es: "¿Qué estás buscando?",
              ja: "どんな対戦を探していますか？",
            })}
            <textarea
              name="comment"
              required
              rows={2}
              placeholder={tr(lang, {
                en: "e.g. Looking for friendlies, Fox/Falco, EST evenings",
                es: "p. ej. Busco amistosos, Fox/Falco, tardes hora del centro",
                ja: "例：フリー対戦募集、フォックス/ファルコ、平日の夜",
              })}
              className="w-full resize-none rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring"
            />
          </label>
          {selectableTiers.length > 0 && (
            <label className="flex flex-col gap-1 text-sm">
              {tr(lang, {
                en: "Who can join?",
                es: "¿Quién puede unirse?",
                ja: "参加できる人",
              })}
              <select
                name="minTier"
                defaultValue=""
                className="w-full rounded-lg border border-border bg-transparent px-2.5 py-1.5 text-sm outline-none focus-visible:border-ring"
              >
                <option value="">{tr(lang, { en: "Anyone", es: "Cualquiera", ja: "誰でも" })}</option>
                {selectableTiers.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}+
                  </option>
                ))}
              </select>
              <span className="text-xs text-muted-foreground">
                {tr(lang, {
                  en: "Everyone sees the post, but only players who've reached that rank can join — and it announces in that rank's Discord channel instead of the general one.",
                  es: "Todos ven la publicación, pero solo quienes hayan alcanzado ese rango pueden unirse — y se anuncia en el canal de Discord de ese rango en vez del general.",
                  ja: "募集は全員に表示されますが、参加できるのはそのランクに到達したプレイヤーだけです。告知も全体チャンネルではなく、そのランクの Discord チャンネルに流れます。",
                })}
              </span>
            </label>
          )}
          <p className="text-xs text-muted-foreground">
            {tr(lang, {
              en: "Region is pulled from your profile — set it on the Lobby page.",
              es: "La región se toma de tu perfil — configúrala en la página de Sala.",
              ja: "地域はプロフィールから読み込まれます。ロビーのページで設定してください。",
            })}
          </p>
          <Button type="submit" className="self-start">
            {tr(lang, { en: "Post", es: "Publicar", ja: "投稿する" })}
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
            {tr(lang, {
              en: "Your post is live. Waiting for someone to join…",
              es: "Tu publicación está activa. Esperando a que alguien se una…",
              ja: "募集を公開しました。参加者を待っています…",
            })}
            {post.minTier && <Badge>{post.minTier}+</Badge>}
          </p>
          <form action={closeFreeBattlePost.bind(null, post.id)} className="mt-3">
            <Button type="submit" variant="outline" size="sm">
              {tr(lang, {
                en: "Close post",
                es: "Cerrar publicación",
                ja: "募集を閉じる",
              })}
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
        <Badge variant="success">
          {tr(lang, {
            en: "Matched!",
            es: "¡Emparejado!",
            ja: "マッチしました！",
          })}
        </Badge>
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
          {tr(lang, {
            en: "Reach out to them on Discord to set up your room code — this page doesn't track the game itself.",
            es: "Contáctalo por Discord para acordar el código de sala — esta página no lleva registro de la partida en sí.",
            ja: "Discord で相手に連絡して、部屋の番号を決めてください。このページでは試合そのものは記録されません。",
          })}
        </p>
        <form action={closeFreeBattlePost.bind(null, post.id)} className="mt-3">
          <Button type="submit" variant="outline" size="sm">
            {tr(lang, {
              en: "Done — post again",
              es: "Listo — publicar de nuevo",
              ja: "完了 — もう一度募集する",
            })}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
