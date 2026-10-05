import { Vote } from "lucide-react";
import { auth } from "@/auth";
import { getLang, type Lang } from "@/lib/i18n";
import { listProposals, getMyVotes, GOLD_VOTE_WEIGHT, PROPOSAL_DESCRIPTION_MAX_LENGTH } from "@/lib/proposals";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { createProposalAction, closeProposalAction, voteOnProposalAction } from "./actions";

export const metadata = { title: "Proposals — Smash Ladder NA" };

export default async function ProposalsPage() {
  const [session, lang] = await Promise.all([auth(), getLang()]);
  const role = session?.user?.role;
  const isStaff = role === "MOD" || role === "ADMIN";

  const proposals = await listProposals();
  const myVotes = session?.user?.id ? await getMyVotes(session.user.id, proposals.map((p) => p.id)) : new Map();

  return (
    <main className="mx-auto w-full max-w-3xl px-6 py-16">
      <h1 className="flex items-center gap-2 text-2xl font-semibold tracking-tight">
        <Vote className="size-6 text-primary" />
        {lang === "es" ? "Propuestas" : "Proposals"}
      </h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {lang === "es"
          ? `Vota a favor o en contra de cambios propuestos al sitio o a las reglas. Cada voto normal cuenta 1; un voto de un colaborador Gold cuenta ${GOLD_VOTE_WEIGHT}.`
          : `Vote for or against proposed changes to the site or the rules. A regular vote counts for 1; a Gold supporter's vote counts for ${GOLD_VOTE_WEIGHT}.`}
      </p>

      {isStaff && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle className="text-base">{lang === "es" ? "Nueva propuesta" : "New proposal"}</CardTitle>
          </CardHeader>
          <CardContent>
            <form action={createProposalAction} className="flex flex-col gap-3">
              <input
                name="title"
                type="text"
                required
                placeholder={lang === "es" ? "Título" : "Title"}
                className="h-8 rounded-lg border border-border bg-background px-2.5 text-sm text-foreground outline-none focus-visible:border-ring"
              />
              <textarea
                name="description"
                required
                maxLength={PROPOSAL_DESCRIPTION_MAX_LENGTH}
                rows={3}
                placeholder={lang === "es" ? "Descripción" : "Description"}
                className="rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus-visible:border-ring"
              />
              <Button type="submit" size="sm" className="w-fit">
                {lang === "es" ? "Publicar" : "Post"}
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="mt-6 flex flex-col gap-4">
        {proposals.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {lang === "es" ? "Todavía no hay propuestas." : "No proposals yet."}
          </p>
        ) : (
          proposals.map((proposal) => (
            <ProposalCard
              key={proposal.id}
              proposal={proposal}
              myVote={myVotes.get(proposal.id) ?? null}
              isSignedIn={!!session?.user?.id}
              isStaff={isStaff}
              lang={lang}
            />
          ))
        )}
      </div>
    </main>
  );
}

function ProposalCard({
  proposal,
  myVote,
  isSignedIn,
  isStaff,
  lang,
}: {
  proposal: Awaited<ReturnType<typeof listProposals>>[number];
  myVote: "FOR" | "AGAINST" | null;
  isSignedIn: boolean;
  isStaff: boolean;
  lang: Lang;
}) {
  const total = proposal.forWeight + proposal.againstWeight;
  const forPercent = total > 0 ? Math.round((proposal.forWeight / total) * 100) : 50;
  const isOpen = proposal.status === "OPEN";

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between gap-2">
          <CardTitle className="text-base">{proposal.title}</CardTitle>
          <Badge variant={isOpen ? "success" : "secondary"} className="text-xs">
            {isOpen ? (lang === "es" ? "Abierta" : "Open") : lang === "es" ? "Cerrada" : "Closed"}
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="flex flex-col gap-3">
        <p className="text-sm text-muted-foreground whitespace-pre-wrap">{proposal.description}</p>
        <p className="text-xs text-muted-foreground">
          {lang === "es" ? "Por" : "By"} {proposal.createdBy.username} ·{" "}
          {proposal.createdAt.toLocaleDateString(lang === "es" ? "es-MX" : "en-US", { dateStyle: "medium" })}
        </p>

        <div className="flex h-4 overflow-hidden rounded-[4px] bg-muted">
          {total > 0 && (
            <>
              <span className="bg-primary" style={{ width: `${forPercent}%` }} />
              <span className="bg-destructive/60" style={{ width: `${100 - forPercent}%` }} />
            </>
          )}
        </div>
        <p className="text-xs tabular-nums text-muted-foreground">
          {lang === "es" ? "A favor" : "For"}: {proposal.forWeight} · {lang === "es" ? "En contra" : "Against"}:{" "}
          {proposal.againstWeight}
        </p>

        {isOpen && isSignedIn && (
          <div className="flex gap-2">
            <form action={voteOnProposalAction.bind(null, proposal.id, "FOR")}>
              <Button type="submit" size="sm" variant={myVote === "FOR" ? "default" : "outline"}>
                {lang === "es" ? "A favor" : "Vote For"}
              </Button>
            </form>
            <form action={voteOnProposalAction.bind(null, proposal.id, "AGAINST")}>
              <Button type="submit" size="sm" variant={myVote === "AGAINST" ? "default" : "outline"}>
                {lang === "es" ? "En contra" : "Vote Against"}
              </Button>
            </form>
          </div>
        )}
        {isOpen && !isSignedIn && (
          <p className="text-xs text-muted-foreground">
            {lang === "es" ? "Inicia sesión para votar." : "Sign in to vote."}
          </p>
        )}
        {isOpen && isStaff && (
          <form action={closeProposalAction.bind(null, proposal.id)}>
            <Button type="submit" size="sm" variant="outline">
              {lang === "es" ? "Cerrar votación" : "Close voting"}
            </Button>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
