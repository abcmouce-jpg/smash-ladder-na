"use client";

import { useActionState, useEffect, useRef, useState, useTransition } from "react";
import { ChevronDown, ChevronUp, Flag, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useConfirm } from "@/components/confirm-dialog";
import type { Lang } from "@/lib/i18n";
import type { GuideActionState, GuideFormState } from "@/app/notes/actions";

export type Guide = {
  id: string;
  character: string;
  content: string;
  score: number;
  authorId: string;
  author: { id: string; username: string };
  myVote: number;
};

export function CharacterGuideSection({
  character,
  guides,
  userId,
  hasOwnNote,
  maxLength,
  createAction,
  editAction,
  deleteGuide,
  voteOnGuide,
  flagGuideAction,
  importGuide,
  lang,
}: {
  character: string;
  guides: Guide[];
  userId: string | null;
  hasOwnNote: boolean;
  maxLength: number;
  createAction: (character: string, prevState: GuideFormState, formData: FormData) => Promise<GuideFormState>;
  editAction: (guideId: string, prevState: GuideFormState, formData: FormData) => Promise<GuideFormState>;
  deleteGuide: (guideId: string) => Promise<GuideActionState>;
  voteOnGuide: (guideId: string, value: 1 | -1) => Promise<GuideActionState>;
  flagGuideAction: (guideId: string) => Promise<GuideActionState>;
  importGuide: (guideId: string) => Promise<GuideActionState>;
  lang: Lang;
}) {
  const [writing, setWriting] = useState(false);
  const boundCreate = createAction.bind(null, character);
  const [createState, createFormAction, createPending] = useActionState(boundCreate, { error: null });
  const submittedRef = useRef(false);

  // Only collapse the composer once a submission actually succeeds — closing
  // it on click (before the result is known) would hide a validation error
  // along with the form that has it.
  useEffect(() => {
    if (submittedRef.current && createState.error === null) {
      submittedRef.current = false;
      setWriting(false);
    }
  }, [createState]);

  return (
    <div className="mt-3 border-t border-border pt-3">
      <p className="text-xs font-medium text-muted-foreground">
        {lang === "es" ? "Guías de la comunidad" : "Community guides"}
      </p>
      {guides.length === 0 && !writing && (
        <p className="mt-1 text-xs text-muted-foreground">
          {lang === "es" ? "Nadie ha escrito una guía para este personaje todavía." : "No one's written a guide for this character yet."}
        </p>
      )}
      <ul className="mt-2 flex flex-col gap-2">
        {guides.map((guide) => (
          <GuideCard
            key={guide.id}
            guide={guide}
            userId={userId}
            hasOwnNote={hasOwnNote}
            maxLength={maxLength}
            editAction={editAction}
            deleteGuide={deleteGuide}
            voteOnGuide={voteOnGuide}
            flagGuideAction={flagGuideAction}
            importGuide={importGuide}
            lang={lang}
          />
        ))}
      </ul>

      {userId && !writing && (
        <Button type="button" size="sm" variant="outline" className="mt-2" onClick={() => setWriting(true)}>
          {lang === "es" ? "Escribir una guía" : "Write a guide"}
        </Button>
      )}
      {userId && writing && (
        <form action={createFormAction} className="mt-2 flex flex-col gap-1.5">
          <textarea
            name="content"
            maxLength={maxLength}
            rows={8}
            placeholder={
              lang === "es"
                ? "Matchups, consejos de escenario, lo que sea útil para otros jugando contra este personaje…"
                : "Matchups, stage tips, anything useful for others playing against this character…"
            }
            className="w-full resize-y rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus-visible:border-ring"
          />
          <div className="flex items-center justify-between gap-2">
            {createState.error ? <p className="text-xs text-destructive">{createState.error}</p> : <span />}
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setWriting(false)}>
                {lang === "es" ? "Cancelar" : "Cancel"}
              </Button>
              <Button type="submit" size="sm" disabled={createPending} onClick={() => (submittedRef.current = true)}>
                {lang === "es" ? "Publicar" : "Post"}
              </Button>
            </div>
          </div>
        </form>
      )}
    </div>
  );
}

function GuideCard({
  guide,
  userId,
  hasOwnNote,
  maxLength,
  editAction,
  deleteGuide,
  voteOnGuide,
  flagGuideAction,
  importGuide,
  lang,
}: {
  guide: Guide;
  userId: string | null;
  hasOwnNote: boolean;
  maxLength: number;
  editAction: (guideId: string, prevState: GuideFormState, formData: FormData) => Promise<GuideFormState>;
  deleteGuide: (guideId: string) => Promise<GuideActionState>;
  voteOnGuide: (guideId: string, value: 1 | -1) => Promise<GuideActionState>;
  flagGuideAction: (guideId: string) => Promise<GuideActionState>;
  importGuide: (guideId: string) => Promise<GuideActionState>;
  lang: Lang;
}) {
  const [editing, setEditing] = useState(false);
  const [isPending, startTransition] = useTransition();
  const [confirm, confirmDialog] = useConfirm();
  const boundEdit = editAction.bind(null, guide.id);
  const [editState, editFormAction, editPending] = useActionState(boundEdit, { error: null });
  const editSubmittedRef = useRef(false);
  const isOwn = userId === guide.authorId;
  // vote/flag/delete/import aren't <form action>s (they're plain onClick
  // handlers behind useTransition), so unlike the create/edit forms above
  // they have no useActionState to surface a failure through — this fills
  // that gap so a denied/raced request shows a message instead of silently
  // doing nothing.
  const [actionError, setActionError] = useState<string | null>(null);

  function runAction(action: () => Promise<GuideActionState>) {
    startTransition(async () => {
      const result = await action();
      setActionError(result.error);
    });
  }

  // Same "only close on actual success" reasoning as the composer above —
  // closing on submit would hide a validation error along with the form.
  useEffect(() => {
    if (editSubmittedRef.current && editState.error === null) {
      editSubmittedRef.current = false;
      setEditing(false);
    }
  }, [editState]);

  async function handleImport() {
    const ok = hasOwnNote
      ? await confirm(
          lang === "es"
            ? "Esto sobrescribirá tu nota privada actual para este personaje. ¿Continuar?"
            : "This will overwrite your current private note for this character. Continue?",
          { confirmLabel: lang === "es" ? "Sobrescribir" : "Overwrite", variant: "destructive" },
        )
      : true;
    if (!ok) return;
    runAction(() => importGuide(guide.id));
  }

  return (
    <li className="rounded-lg border border-border p-2.5">
      {editing ? (
        <form action={editFormAction} className="flex flex-col gap-1.5">
          <textarea
            name="content"
            defaultValue={guide.content}
            maxLength={maxLength}
            rows={8}
            className="w-full resize-y rounded-lg border border-border bg-background px-2.5 py-2 text-sm text-foreground outline-none focus-visible:border-ring"
          />
          <div className="flex items-center justify-between gap-2">
            {editState.error ? <p className="text-xs text-destructive">{editState.error}</p> : <span />}
            <div className="flex gap-2">
              <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
                {lang === "es" ? "Cancelar" : "Cancel"}
              </Button>
              <Button type="submit" size="sm" disabled={editPending} onClick={() => (editSubmittedRef.current = true)}>
                {lang === "es" ? "Guardar" : "Save"}
              </Button>
            </div>
          </div>
        </form>
      ) : (
        <>
          <p className="whitespace-pre-wrap text-sm text-foreground">{guide.content}</p>
          <div className="mt-2 flex items-center gap-2 text-xs text-muted-foreground">
            <span className="truncate">— {guide.author.username}</span>
            <span className="ml-auto flex items-center gap-0.5">
              <button
                type="button"
                disabled={!userId || isOwn || isPending}
                onClick={() => runAction(() => voteOnGuide(guide.id, 1))}
                aria-label={lang === "es" ? "Votar a favor" : "Upvote"}
                className={`rounded p-1 hover:bg-muted ${guide.myVote === 1 ? "text-primary" : ""}`}
              >
                <ChevronUp className="size-3.5" />
              </button>
              <span className="tabular-nums">{guide.score}</span>
              <button
                type="button"
                disabled={!userId || isOwn || isPending}
                onClick={() => runAction(() => voteOnGuide(guide.id, -1))}
                aria-label={lang === "es" ? "Votar en contra" : "Downvote"}
                className={`rounded p-1 hover:bg-muted ${guide.myVote === -1 ? "text-destructive" : ""}`}
              >
                <ChevronDown className="size-3.5" />
              </button>
            </span>
            {userId && (
              <Button type="button" size="sm" variant="outline" className="h-6 px-2 text-xs" onClick={handleImport} disabled={isPending}>
                {lang === "es" ? "Importar a mi nota" : "Import to my note"}
              </Button>
            )}
            {isOwn ? (
              <>
                <button type="button" onClick={() => setEditing(true)} aria-label={lang === "es" ? "Editar" : "Edit"} className="rounded p-1 hover:bg-muted">
                  <Pencil className="size-3.5" />
                </button>
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => runAction(() => deleteGuide(guide.id))}
                  aria-label={lang === "es" ? "Eliminar" : "Delete"}
                  className="rounded p-1 hover:bg-muted hover:text-destructive"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </>
            ) : (
              userId && (
                <button
                  type="button"
                  disabled={isPending}
                  onClick={() => runAction(() => flagGuideAction(guide.id))}
                  aria-label={lang === "es" ? "Reportar" : "Flag"}
                  className="rounded p-1 hover:bg-muted hover:text-destructive"
                >
                  <Flag className="size-3.5" />
                </button>
              )
            )}
          </div>
          {actionError && <p className="mt-1 text-xs text-destructive">{actionError}</p>}
        </>
      )}
      {confirmDialog}
    </li>
  );
}
